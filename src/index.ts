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
    
    // Handle speech-to-text API
    if (url.pathname === '/speech-to-text' && request.method === 'POST') {
      return handleSpeechToText(request, env);
    }
    
    // Handle chat completion API
    if (url.pathname === '/chat' && request.method === 'POST') {
      return handleChat(request, env);
    }
    
    // Handle text-to-speech API
    if (url.pathname === '/text-to-speech' && request.method === 'POST') {
      return handleTextToSpeech(request, env);
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

  console.log('WebSocket connection established for session:', sessionId);

  // Get any stored compliments for this session
  let storedCompliments = '';
  try {
    storedCompliments = await env.COMPLIMENTS.get(sessionId) || '';
  } catch (error) {
    console.error('Error getting compliments from KV:', error);
  }

  // Send initial connection confirmation with compliments
  server.send(JSON.stringify({
    type: 'session.created',
    session: {
      id: sessionId,
      compliments: storedCompliments
    }
  }));

  // Handle incoming messages
  server.addEventListener('message', async (event) => {
    try {
      console.log('Received WebSocket message');
      
      if (typeof event.data === 'string') {
        const data = JSON.parse(event.data);
        
        if (data.type === 'session.update') {
          // Send session configuration
          let instructions = `You are a friendly AI assistant having a real-time voice conversation. 
            Be conversational, engaging, and helpful. Keep responses concise but warm.
            Always end your responses with a question to keep the conversation flowing.
            **You must speak only in English.**`;
          
          if (storedCompliments) {
            instructions += `\n\nI can see you right now, and I want to compliment you: ${storedCompliments}`;
          }

          server.send(JSON.stringify({
            type: 'session.updated',
            session: {
              modalities: ['text', 'audio'],
              instructions: instructions,
              voice: 'alloy',
              input_audio_format: 'pcm16',
              output_audio_format: 'pcm16'
            }
          }));
        } else if (data.type === 'response.create') {
          // Trigger an initial AI response
          server.send(JSON.stringify({
            type: 'response.created',
            response: {
              id: 'resp_' + Math.random().toString(36).substr(2, 9),
              status: 'in_progress'
            }
          }));

          // Simulate AI audio response
          setTimeout(() => {
            const greeting = storedCompliments 
              ? `Hello! ${storedCompliments} How are you doing today?`
              : "Hello! Welcome to the AI Greeter. How are you doing today?";
            
            server.send(JSON.stringify({
              type: 'response.audio.delta',
              delta: btoa(greeting) // Simple text-to-speech simulation
            }));

            server.send(JSON.stringify({
              type: 'response.done',
              response: {
                id: 'resp_' + Math.random().toString(36).substr(2, 9),
                status: 'completed'
              }
            }));
          }, 1000);
        }
      } else {
        // Handle binary audio data - for now just acknowledge
        server.send(JSON.stringify({
          type: 'input_audio_buffer.speech_started'
        }));
        
        setTimeout(() => {
          server.send(JSON.stringify({
            type: 'input_audio_buffer.speech_stopped'
          }));
        }, 100);
      }
    } catch (error) {
      console.error('WebSocket message error:', error);
      server.send(JSON.stringify({ 
        type: 'error', 
        error: { message: 'Internal server error' } 
      }));
    }
  });

  // Handle connection closure
  server.addEventListener('close', () => {
    console.log('Client WebSocket connection closed');
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

async function handleSpeechToText(request: Request, env: Env): Promise<Response> {
  try {
    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get audio data from request
    const audioData = await request.arrayBuffer();
    const sessionId = request.headers.get('x-session-id');

    if (!audioData || !sessionId) {
      return new Response(JSON.stringify({ error: 'Missing audio data or session ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create form data for OpenAI Whisper API
    const formData = new FormData();
    formData.append('file', new Blob([audioData], { type: 'audio/webm' }), 'audio.webm');
    formData.append('model', 'whisper-1');

    // Call OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: formData
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const result = await response.json();
    
    return new Response(JSON.stringify({
      success: true,
      text: result.text || ''
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Speech-to-text error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to transcribe audio',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleChat(request: Request, env: Env): Promise<Response> {
  try {
    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { text, sessionId } = await request.json();

    if (!text || !sessionId) {
      return new Response(JSON.stringify({ error: 'Missing text or session ID' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get stored compliments for this session
    let storedCompliments = '';
    try {
      storedCompliments = await env.COMPLIMENTS.get(sessionId) || '';
    } catch (error) {
      console.error('Error getting compliments from KV:', error);
    }

    // Create system message with compliments
    let systemMessage = `You are a friendly AI assistant having a voice conversation. 
      Be conversational, engaging, and helpful. Keep responses concise but warm (1-2 sentences max).
      Always end your responses with a question to keep the conversation flowing.
      **You must speak only in English.**`;
    
    if (storedCompliments) {
      systemMessage += `\n\nI can see you right now, and I want to compliment you: ${storedCompliments}`;
    }

    // Initialize OpenAI
    const openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });

    // Get AI response
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemMessage },
        { role: "user", content: text }
      ],
      max_tokens: 100,
      temperature: 0.7
    });

    const aiResponse = response.choices[0]?.message?.content || "I'm sorry, I didn't understand that.";

    return new Response(JSON.stringify({
      success: true,
      response: aiResponse
    }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Chat completion error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to get AI response',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleTextToSpeech(request: Request, env: Env): Promise<Response> {
  try {
    if (!env.OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'API key not configured' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { text } = await request.json();

    if (!text) {
      return new Response(JSON.stringify({ error: 'Missing text' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Call OpenAI Text-to-Speech API
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'alloy',
        input: text,
        response_format: 'mp3'
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    // Return the audio data directly
    return new Response(response.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache'
      }
    });

  } catch (error) {
    console.error('Text-to-speech error:', error);
    return new Response(JSON.stringify({
      error: 'Failed to generate speech',
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