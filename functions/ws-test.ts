export async function onRequest(context: any): Promise<Response> {
  const { request } = context;
  
  // Handle WebSocket upgrade
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  server.accept();

  server.addEventListener('message', (event) => {
    console.log('Received message:', event.data);
    server.send('Echo: ' + event.data);
  });

  server.addEventListener('close', () => {
    console.log('WebSocket connection closed');
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
} 