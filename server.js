// server.js
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// 각 테이블의 모든 상태를 저장하는 객체
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
    // URL에 따라 다른 HTML 파일 제공
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(path.join(__dirname, 'manager.html')).pipe(res);
    } else if (req.url === '/kiosk') {
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
    // 새로운 클라이언트에게 현재 모든 테이블 상태 전송
    ws.send(JSON.stringify({ type: 'init', tables: tables }));

    ws.on('message', message => {
        const data = JSON.parse(message);
        const tableId = data.tableId;

        // 1. 테이블 점유 상태 변경 (손님 입장)
        if (data.type === 'occupy') {
            tables[tableId].isOccupied = true;
            tables[tableId].startTime = Date.now();
            tables[tableId].totalPrice = 0;
            tables[tableId].orders = [];
            
            // 모든 클라이언트에게 변경사항 전송
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'table-update', tableId: tableId, tableData: tables[tableId] }));
                }
            });
        } 
        
        // 2. 키오스크 주문 접수
        else if (data.type === 'order') {
            const { tableId, items, totalPrice } = data;
            tables[tableId].orders.push({
                time: new Date().toLocaleTimeString(),
                items: items,
                totalPrice: totalPrice
            });
            tables[tableId].totalPrice += totalPrice;

            // 모든 관리자 클라이언트에게 주문 내역 및 총 금액 업데이트
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'order-update', tableId: tableId, tableData: tables[tableId] }));
                }
            });
        }
        
        // 3. 테이블 초기화 (정산 완료 및 손님 퇴장)
        else if (data.type === 'checkout') {
            tables[tableId].isOccupied = false;
            tables[tableId].startTime = null;
            tables[tableId].totalPrice = 0;
            tables[tableId].orders = [];

            // 모든 클라이언트에게 초기화 정보 전송
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