// server.js
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

const tables = {};
['A', 'B', 'C', 'D'].forEach(section => {
    for (let i = 1; i <= 6; i++) {
        const tableId = `${section}-${i}`;
        tables[tableId] = {
            isOccupied: false,
            startTime: null,
            totalPrice: 0,
            orders: []
        };
    }
});

const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/manager') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(path.join(__dirname, 'manager.html')).pipe(res);
    } else if (url === '/kiosk') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(path.join(__dirname, 'kiosk.html')).pipe(res);
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    console.log('클라이언트가 연결되었습니다.');
    ws.send(JSON.stringify({ type: 'init', tables: tables }));

    ws.on('message', message => {
        const data = JSON.parse(message);
        const tableId = data.tableId;

        if (data.type === 'occupy') {
            console.log(`[occupy] 테이블 ${tableId} 점유 시도`);
            if (tables[tableId]) {
                tables[tableId].isOccupied = true;
                tables[tableId].startTime = Date.now();
                tables[tableId].totalPrice = 0;
                tables[tableId].orders = [];
            
                wss.clients.forEach(client => {
                    if (client.readyState === WebSocket.OPEN) {
                        client.send(JSON.stringify({ type: 'table-update', tableId: tableId, tableData: tables[tableId] }));
                    }
                });
            }
        } else if (data.type === 'order') {
            console.log(`[order] 테이블 ${tableId} 주문 접수`);
            const { tableId, items, totalPrice } = data;
            if (tables[tableId]) {
                tables[tableId].orders.push({
                    time: new Date().toLocaleTimeString('ko-KR'),
                    items: items,
                    totalPrice: totalPrice
                });
                tables[tableId].totalPrice += totalPrice;
            }

            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'order-update', tableId: tableId, tableData: tables[tableId] }));
                }
            });
        } else if (data.type === 'checkout') {
            console.log(`[checkout] 테이블 ${tableId} 정산 완료`);
            if (tables[tableId]) {
                tables[tableId].isOccupied = false;
                tables[tableId].startTime = null;
                tables[tableId].totalPrice = 0;
                tables[tableId].orders = [];
            }
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'table-update', tableId: tableId, tableData: tables[tableId] }));
                }
            });
        }
    });

    ws.on('close', () => {
        console.log('클라이언트 연결이 끊어졌습니다.');
    });
});

server.listen(8080, () => {
    console.log('서버가 8080 포트에서 실행 중입니다.');
});
