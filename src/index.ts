import { OpenAI } from 'openai';

interface Env {
  COMPLIMENTS: KVNamespace;
  OPENAI_API_KEY: string;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle WebSocket upgrade for /ws
    if (url.pathname === '/ws') {
      return handleWebSocket(request, env);
    }
    
    // Handle vision API
    if (url.pathname === '/vision' && request.method === 'POST') {
      return handleVision(request, env);
    }
    
    // Handle test endpoints
    if (url.pathname === '/test') {
      return new Response(JSON.stringify({ 
        message: "Test function is working!",
        timestamp: new Date().toISOString()
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/vision-simple' && request.method === 'POST') {
      return handleVisionSimple(request, env);
    }
    
    // For all other requests, serve static files (handled automatically by Workers with assets)
    return new Response('Not found', { status: 404 });
  },
};

async function handleWebSocket(request: Request, env: Env): Promise<Response> {
  // Check for secret first
  if (!env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY secret not set');
    return new Response('Server configuration error: Missing API key', { status: 500 });
  }

  // Handle WebSocket upgrade
  const upgradeHeader = request.headers.get('Upgrade');
  const connectionHeader = request.headers.get('Connection');
  
  if (upgradeHeader !== 'websocket' || !connectionHeader?.toLowerCase().includes('upgrade')) {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const url = new URL(request.url);
  const sessionId = url.searchParams.get('sessionId');
  
  if (!sessionId) {
    return new Response('Missing sessionId', { status: 400 });
  }

  const webSocketPair = new WebSocketPair();
  const [client, server] = Object.values(webSocketPair);

  server.accept();

  // Send immediate confirmation that WebSocket is connected
  server.addEventListener('open', () => {
    console.log('Client WebSocket connected');
    server.send(JSON.stringify({ type: 'connection', status: 'connected' }));
  });

  // Connect to OpenAI's Realtime API
  console.log('Creating OpenAI WebSocket connection...');
  const openaiWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01', {
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'OpenAI-Beta': 'realtime=v1'
    }
  });

  // Add immediate error handling
  openaiWs.addEventListener('error', (error) => {
    console.error('OpenAI WebSocket connection error:', error);
    server.close(1011, 'OpenAI connection failed');
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

async function handleVision(request: Request, env: Env): Promise<Response> {
  try {
    // Check if API key is available
    if (!env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY not found in environment');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if KV namespace is available
    if (!env.COMPLIMENTS) {
      console.error('COMPLIMENTS KV namespace not found');
      return new Response(JSON.stringify({ error: 'KV namespace configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get base64 image from request body and session ID from header
    const base64Image = await request.text();
    const sessionId = request.headers.get('x-session-id');

    console.log('Vision request received:', { 
      hasImage: !!base64Image, 
      imageLength: base64Image?.length,
      sessionId: sessionId 
    });

    if (!base64Image || !sessionId) {
      return new Response(JSON.stringify({ error: 'Missing image or sessionId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create data URL for OpenAI
    const dataUrl = `data:image/jpeg;base64,${base64Image}`;

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });

    // Generate compliment using OpenAI Vision
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Look at this person and give them a genuine, specific compliment about their appearance. Be warm and friendly, but keep it brief (1-2 sentences). Focus on positive aspects like their style, expression, or overall look."
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl
              }
            }
          ]
        }
      ],
      max_tokens: 100
    });

    const compliment = response.choices[0]?.message?.content || "You look wonderful today!";

    // Store the compliment in KV with the session ID
    await env.COMPLIMENTS.put(sessionId, compliment, { expirationTtl: 3600 }); // 1 hour expiration

    return new Response(JSON.stringify({ 
      success: true, 
      compliment: compliment 
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Vision processing error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      name: error instanceof Error ? error.name : undefined
    });
    
    return new Response(JSON.stringify({ 
      error: 'Failed to process image',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleVisionSimple(request: Request, env: Env): Promise<Response> {
  try {
    // Get base64 image from request body and session ID from header
    const base64Image = await request.text();
    const sessionId = request.headers.get('x-session-id');

    console.log('Vision request received:', { 
      hasImage: !!base64Image, 
      imageLength: base64Image?.length,
      sessionId: sessionId,
      hasApiKey: !!env.OPENAI_API_KEY,
      hasKV: !!env.COMPLIMENTS
    });

    if (!base64Image || !sessionId) {
      return new Response(JSON.stringify({ error: 'Missing image or sessionId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // For now, just return a mock compliment without calling OpenAI
    const mockCompliment = "You look great today! This is a test response.";

    // Try to store in KV if available
    if (env.COMPLIMENTS) {
      try {
        await env.COMPLIMENTS.put(sessionId, mockCompliment, { expirationTtl: 3600 });
        console.log('Stored compliment in KV successfully');
      } catch (kvError) {
        console.error('KV storage error:', kvError);
      }
    } else {
      console.log('KV namespace not available');
    }

    return new Response(JSON.stringify({ 
      success: true, 
      compliment: mockCompliment,
      debug: {
        imageReceived: !!base64Image,
        sessionId: sessionId,
        apiKeyAvailable: !!env.OPENAI_API_KEY,
        kvAvailable: !!env.COMPLIMENTS
      }
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Vision processing error:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to process image',
      details: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 