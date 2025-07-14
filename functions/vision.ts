import { OpenAI } from 'openai';

interface Env {
  COMPLIMENTS: KVNamespace;
  OPENAI_API_KEY: string;
}

export async function onRequestPost(context: any): Promise<Response> {
  const { request, env } = context;

  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File;
    const sessionId = formData.get('sessionId') as string;

    if (!imageFile || !sessionId) {
      return new Response(JSON.stringify({ error: 'Missing image or sessionId' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Convert image to base64
    const arrayBuffer = await imageFile.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const dataUrl = `data:${imageFile.type};base64,${base64Image}`;

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