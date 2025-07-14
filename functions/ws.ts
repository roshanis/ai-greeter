import { OpenAI } from 'openai';

interface Env {
  COMPLIMENTS: KVNamespace;
  OPENAI_API_KEY: string;
}

export async function onRequestGet(context: any): Promise<Response> {
  const { request, env } = context;
  
  // Handle WebSocket upgrade
  const upgradeHeader = request.headers.get('Upgrade');
  if (upgradeHeader !== 'websocket') {
    return new Response('Expected Upgrade: websocket', { status: 426 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  
  if (!sessionId) {
    return new Response('Missing sessionId', { status: 400 });
  }

  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  server.accept();

  // Connect to OpenAI's Realtime API
  const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'realtime=v1'
    }
  });

  // When OpenAI WebSocket opens, configure the session
  openaiWs.addEventListener('open', async () => {
    console.log('Connected to OpenAI Realtime API');
    
    // Get any stored compliments for this session
    let storedCompliments = '';
    try {
      storedCompliments = await env.COMPLIMENTS.get(sessionId) || '';
    } catch (error) {
      console.error('Error getting compliments from KV:', error);
    }
    
    let instructions = `You are a friendly AI assistant having a real-time voice conversation. 
      Be conversational, engaging, and helpful. Keep responses concise but warm.
      Always end your responses with a question to keep the conversation flowing.
      **You must speak only in English.**`;
    
    if (storedCompliments) {
      instructions += `\n\nI can see you right now, and I want to compliment you: ${storedCompliments}`;
    }

    const sessionConfig = {
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: instructions,
        voice: 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        }
      }
    };

    openaiWs.send(JSON.stringify(sessionConfig));
  });

  // Forward messages from client to OpenAI
  server.addEventListener('message', (event) => {
    if (openaiWs.readyState === WebSocket.OPEN) {
      openaiWs.send(event.data);
    }
  });

  // Forward messages from OpenAI to client
  openaiWs.addEventListener('message', (event) => {
    if (server.readyState === WebSocket.OPEN) {
      server.send(event.data);
    }
  });

  // Handle connection closures
  server.addEventListener('close', () => {
    console.log('Client WebSocket connection closed');
    openaiWs.close();
  });

  openaiWs.addEventListener('close', () => {
    console.log('OpenAI WebSocket connection closed');
    server.close();
  });

  // Handle errors
  openaiWs.addEventListener('error', (error) => {
    console.error('OpenAI WebSocket error:', error);
    server.close();
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
} 