export async function onRequest(): Promise<Response> {
  return new Response(JSON.stringify({ 
    message: "Test function is working!",
    timestamp: new Date().toISOString()
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
} 