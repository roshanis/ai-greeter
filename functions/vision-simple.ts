export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;

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