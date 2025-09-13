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
            status: 'free',
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
        try {
            const data = JSON.parse(message);
            const tableId = data.tableId;

            if (!tables[tableId]) {
                console.log(`알 수 없는 테이블 ID: ${tableId}`);
                return;
            }

            if (data.type === 'occupy') {
                if (tables[tableId].status === 'free') {
                    tables[tableId].status = 'occupied';
                    tables[tableId].startTime = Date.now();
                    tables[tableId].totalPrice = 0;
                    tables[tableId].orders = [];
                    broadcastUpdate(tableId, tables[tableId]);
                }
            } else if (data.type === 'order-pending') {
                if (tables[tableId].status !== 'pending') {
                    const { items, totalPrice } = data;
                    tables[tableId].status = 'pending';
                    tables[tableId].totalPrice += totalPrice;
                    tables[tableId].orders.push({
                        time: new Date().toLocaleTimeString('ko-KR'),
                        items: items,
                        totalPrice: totalPrice
                    });
                    broadcastUpdate(tableId, tables[tableId]);
                }
            } else if (data.type === 'confirm-order') {
                if (tables[tableId].status === 'pending') {
                    tables[tableId].status = 'occupied';
                    tables[tableId].startTime = Date.now();
                    broadcastUpdate(tableId, tables[tableId]);
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'order-confirmed', tableId: tableId }));
                        }
                    });
                }
            } else if (data.type === 'checkout') {
                tables[tableId].status = 'free';
                tables[tableId].startTime = null;
                tables[tableId].totalPrice = 0;
                tables[tableId].orders = [];
                broadcastUpdate(tableId, tables[tableId]);
            }
        } catch (e) {
            console.error('메시지 처리 오류:', e);
        }
    });

    ws.on('close', () => {
        console.log('클라이언트 연결이 끊어졌습니다.');
    });
});

function broadcastUpdate(tableId, tableData) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'table-update', tableId: tableId, tableData: tableData }));
        }
    });
}

server.listen(process.env.PORT || 8080, () => {
    console.log(`서버가 ${process.env.PORT || 8080} 포트에서 실행 중입니다.`);
});