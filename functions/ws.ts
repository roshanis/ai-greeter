import { OpenAI } from 'openai';

interface Env {
  COMPLIMENTS: KVNamespace;
  OPENAI_API_KEY: string;
}

export async function onRequest(context: any): Promise<Response> {
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

  // Initialize OpenAI
  const openai = new OpenAI({
    apiKey: env.OPENAI_API_KEY,
  });

  server.accept();

  // Handle WebSocket connection
  server.addEventListener('message', async (event) => {
    try {
      console.log('Received WebSocket message');
      
      if (typeof event.data === 'string') {
        // Initial session configuration
        const data = JSON.parse(event.data);
        
        if (data.type === 'session.update') {
          // Get any stored compliments for this session
          const storedCompliments = await env.COMPLIMENTS.get(sessionId);
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

          server.send(JSON.stringify(sessionConfig));
        }
      } else {
        // Binary audio data - forward to OpenAI
        const audioData = new Uint8Array(event.data as ArrayBuffer);
        const base64Audio = btoa(String.fromCharCode(...audioData));
        
        const audioMessage = {
          type: 'input_audio_buffer.append',
          audio: base64Audio
        };

        server.send(JSON.stringify(audioMessage));
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      server.send(JSON.stringify({ type: 'error', message: 'Internal server error' }));
    }
  });

  server.addEventListener('close', () => {
    console.log('WebSocket connection closed');
  });

  return new Response(null, {
    status: 101,
    webSocket: client,
  });
} 