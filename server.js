// server.js
const WebSocket = require('ws');
const http = require('http'); // http 모듈 추가
const fs = require('fs'); // 파일 시스템 모듈 추가
const path = require('path'); // 경로 모듈 추가

// HTTP 서버와 웹소켓 서버를 함께 생성
const server = http.createServer((req, res) => {
    // requests for files
    if (req.url === '/') {
        // 루트 URL 요청 시 tables.html 파일을 제공
        const filePath = path.join(__dirname, 'tables.html');
        fs.readFile(filePath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(data);
            }
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }
});

const wss = new WebSocket.Server({ server }); // HTTP 서버를 웹소켓 서버에 연결

// 모든 테이블의 초기 상태를 저장하는 객체
const tables = {};
['A', 'B', 'C', 'D'].forEach(section => {
    for (let i = 1; i <= 6; i++) {
        tables[`${section}-${i}`] = false; // false: 빈 테이블, true: 점유된 테이블
    }
});

wss.on('connection', ws => {
    console.log('클라이언트가 연결되었습니다.');
    // 새로운 클라이언트에게 현재 테이블 상태를 보냄
    ws.send(JSON.stringify({ type: 'init', tables: tables }));

    ws.on('message', message => {
        const data = JSON.parse(message);
        if (data.type === 'update') {
            const { tableId, isOccupied } = data;
            tables[tableId] = isOccupied;
            console.log(`테이블 ${tableId} 상태가 ${isOccupied}로 변경되었습니다.`);

            // 변경된 상태를 모든 클라이언트에게 전송
            wss.clients.forEach(client => {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(JSON.stringify({ type: 'update', tableId, isOccupied }));
                }
            });
        }
    });

    ws.on('close', () => {
        console.log('클라이언트 연결이 끊어졌습니다.');
    });
});

server.listen(8080, () => {
    console.log('웹 서버 및 웹소켓 서버가 8080 포트에서 실행 중입니다.');
});