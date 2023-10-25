import WebSocket from 'ws';
const ws = new WebSocket('ws://localhost:6970');

ws.addEventListener('open', () => {
    const message = { method: 'setBlock', args: { num: 10} };
    ws.send(JSON.stringify(message));
});

ws.addEventListener('message', (event) => {
    console.log(`Received: ${event.data}`);
});
