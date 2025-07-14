import { OpenAI } from 'openai';

interface Env {
  COMPLIMENTS: KVNamespace;
  OPENAI_API_KEY: string;
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;

  try {
    // Get base64 image from request body and session ID from header
    const base64Image = await request.text();
    const sessionId = request.headers.get('x-session-id');

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
    return new Response(JSON.stringify({ 
      error: 'Failed to process image' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
} 