// server.js
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

let tables = {};
const tableIds = ['A-1', 'A-2', 'A-3', 'A-4', 'A-5', 'A-6', 'B-1', 'B-2', 'B-3', 'B-4', 'B-5', 'B-6', 'C-1', 'C-2', 'C-3', 'C-4', 'C-5', 'C-6', 'D-1', 'D-2', 'D-3', 'D-4', 'D-5', 'D-6'];
tableIds.forEach(tableId => {
    tables[tableId] = {
        status: 'free',
        startTime: null,
        totalPrice: 0,
        orders: []
    };
});

let menu = [];
const menuFilePath = path.join(__dirname, 'menu.json');
let salesData = [];
const salesFilePath = path.join(__dirname, 'sales.json');

function loadMenu() {
    try {
        const data = fs.readFileSync(menuFilePath, 'utf8');
        menu = JSON.parse(data);
    } catch (e) {
        console.error('메뉴 파일을 읽을 수 없습니다:', e);
        menu = [];
    }
}

function saveMenu() {
    fs.writeFile(menuFilePath, JSON.stringify(menu, null, 2), 'utf8', (err) => {
        if (err) console.error('메뉴 파일 저장 오류:', err);
    });
}

function loadSales() {
    try {
        const data = fs.readFileSync(salesFilePath, 'utf8');
        salesData = JSON.parse(data);
    } catch (e) {
        console.error('판매 기록 파일을 읽을 수 없습니다:', e);
        salesData = [];
    }
}

function saveSales() {
    fs.writeFile(salesFilePath, JSON.stringify(salesData, null, 2), 'utf8', (err) => {
        if (err) console.error('판매 기록 파일 저장 오류:', err);
    });
}

loadMenu();
loadSales();

const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/manager') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(path.join(__dirname, 'manager.html')).pipe(res);
    } else if (url === '/kiosk') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        fs.createReadStream(path.join(__dirname, 'kiosk.html')).pipe(res);
    } else if (url === '/api/menu') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(menu));
    } else if (url === '/api/sales') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(salesData));
    } else if (url.endsWith('.jpeg') || url.endsWith('.jpg') || url.endsWith('.png') || url.endsWith('.gif')) {
        const imagePath = path.join(__dirname, url);
        fs.readFile(imagePath, (err, data) => {
            if (err) {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('Image not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'image/jpeg' });
            res.end(data);
        });
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }
});

const wss = new WebSocket.Server({ server });

wss.on('connection', ws => {
    console.log('클라이언트가 연결되었습니다.');
    ws.send(JSON.stringify({ type: 'init', tables: tables, menu: menu }));

    ws.on('message', message => {
        try {
            const data = JSON.parse(message);
            const tableId = data.tableId;

            if (tableId && !tables[tableId]) {
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
                const { items, totalPrice } = data;
                tables[tableId].status = 'pending';
                tables[tableId].totalPrice += totalPrice;
                tables[tableId].orders.push({
                    time: new Date().toISOString(),
                    items: items,
                    totalPrice: totalPrice
                });
                broadcastUpdate(tableId, tables[tableId]);
            } else if (data.type === 'confirm-order') {
                if (tables[tableId].status === 'pending') {
                    tables[tableId].status = 'occupied';
                    broadcastUpdate(tableId, tables[tableId]);
                    wss.clients.forEach(client => {
                        if (client.readyState === WebSocket.OPEN) {
                            client.send(JSON.stringify({ type: 'order-confirmed', tableId: tableId }));
                        }
                    });
                }
            } else if (data.type === 'checkout') {
                salesData.push({
                    tableId: tableId,
                    checkoutTime: new Date().toISOString(),
                    totalPrice: tables[tableId].totalPrice,
                    orders: tables[tableId].orders
                });
                saveSales();

                tables[tableId].status = 'free';
                tables[tableId].startTime = null;
                tables[tableId].totalPrice = 0;
                tables[tableId].orders = [];
                broadcastUpdate(tableId, tables[tableId]);
            } else if (data.type === 'cancel-order') {
                if (tables[tableId] && tables[tableId].status === 'pending') {
                    // 마지막 주문을 배열에서 제거
                    const canceledOrder = tables[tableId].orders.pop();
                    if (canceledOrder) {
                        // 총 금액에서 취소된 주문의 금액을 뺌
                        tables[tableId].totalPrice -= canceledOrder.totalPrice;
                    }
                    // 테이블 상태를 '사용 중'으로 되돌림
                    tables[tableId].status = 'occupied';
                    broadcastUpdate(tableId, tables[tableId]);
                } else if (data.type === 'update-menu') {
                menu = data.menu;
                saveMenu();
                broadcastMenuUpdate();
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

function broadcastMenuUpdate() {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type: 'menu-update', menu: menu }));
        }
    });
}

server.listen(process.env.PORT || 8080, () => {
    console.log(`서버가 ${process.env.PORT || 8080} 포트에서 실행 중입니다.`);
});
