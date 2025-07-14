import { Router, IRequest } from 'itty-router';
import { OpenAI } from 'openai';
import { Ai } from "@cloudflare/ai";

// This is a simple AI greeter application.
// It uses Cloudflare Workers, AI, and KV storage.

export interface Env {
	COMPLIMENTS: KVNamespace;
	OPENAI_API_KEY: string;
	AI: any;
}

const router = Router();

// Endpoint for the frontend to connect to the WebSocket
router.get('/', async (request: IRequest, env: Env, ctx: ExecutionContext) => {
	const { searchParams } = new URL(request.url);
	const clientSessionId = searchParams.get('sessionId');

	if (!clientSessionId) {
		return new Response('Missing sessionId', { status: 400 });
	}

	const { webSocket, response } = new WebSocketPair();
	(webSocket as any).clientSessionId = clientSessionId;

	handleWebSocketSession(webSocket, env, clientSessionId);

	return response;
});

// Vision endpoint to receive images and generate compliments
router.post('/vision', async (request: IRequest, env: Env, ctx: ExecutionContext) => {
	try {
		const clientSessionId = request.headers.get('x-session-id');
		if (!clientSessionId) {
			return new Response('Missing x-session-id header', { status: 400 });
		}

		const base64Image = await request.text();

		const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
		const chatResponse = await openai.chat.completions.create({
			model: 'gpt-4o-mini',
			max_tokens: 60,
			messages: [
				{
					role: 'user',
					content: [
						{ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Image}` } },
						{
							type: 'text',
							text: "Give a short, friendly compliment about this person's appearance, outfit, or style. Keep it natural and conversational.",
						},
					],
				},
			],
		});

		const compliment = chatResponse.choices[0].message.content;
		if (compliment) {
			await env.COMPLIMENTS.put(`vision:${clientSessionId}`, compliment, { expirationTtl: 60 });
		}

		return new Response(null, { status: 204 });
	} catch (error) {
		console.error('Vision processing error:', error);
		return new Response('Vision processing failed', { status: 500 });
	}
});

router.all('*', () => new Response('Not Found.', { status: 404 }));

async function handleWebSocketSession(clientWs: WebSocket, env: Env, clientSessionId: string) {
	// Establish connection to OpenAI's Realtime API
	const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
	const realtimeWs = new WebSocket('wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview', {
		headers: {
			Authorization: `Bearer ${env.OPENAI_API_KEY}`,
			'OpenAI-Beta': 'realtime=v1',
		},
	});

	realtimeWs.accept();

	// Forward messages from client to OpenAI
	clientWs.addEventListener('message', (event) => {
		if (realtimeWs.readyState === WebSocket.READY_STATE_OPEN) {
			if (typeof event.data === 'string') {
				realtimeWs.send(event.data);
			} else if (event.data instanceof ArrayBuffer) {
				const audioEvent = JSON.stringify({
					type: 'input_audio_buffer.append',
					audio: btoa(String.fromCharCode(...new Uint8Array(event.data))),
				});
				realtimeWs.send(audioEvent);
			}
		}
	});

	// Forward messages from OpenAI to client
	realtimeWs.addEventListener('message', (event) => {
		if (clientWs.readyState === WebSocket.READY_STATE_OPEN) {
			const message = JSON.parse(event.data.toString());
			if (message.type === 'response.audio.delta' && message.delta) {
				const audioBuffer = Uint8Array.from(atob(message.delta), (c) => c.charCodeAt(0));
				clientWs.send(audioBuffer.buffer);
			} else {
				clientWs.send(event.data);
			}
		}
	});

	const setupOpenAISession = () => {
		if (realtimeWs.readyState === WebSocket.READY_STATE_OPEN) {
			realtimeWs.send(
				JSON.stringify({
					type: 'session.update',
					session: {
						modalities: ['text', 'audio'],
						instructions: `You are a friendly, talkative AI greeter. Your main goal is to keep the conversation going for as long as possible. **You must speak only in English.** Welcome visitors warmly, ask them questions about their day, their interests, or what they're up to. Be curious and engaging. When you receive vision context about someone's appearance, naturally incorporate compliments into the conversation. After you speak, always end with a question to encourage the user to respond. Do not let the conversation die. If there's a pause, proactively start a new topic.`,
						voice: 'alloy',
						input_audio_format: 'pcm16',
						output_audio_format: 'pcm16',
						input_audio_transcription: { model: 'whisper-1' },
					},
				})
			);
		}
	};

	realtimeWs.addEventListener('open', () => {
		console.log(`Connected to OpenAI Realtime API for session ${clientSessionId}`);
		setupOpenAISession();
	});

	// Periodically check for vision summaries and inject them
	const visionInterval = setInterval(async () => {
		const summary = await env.COMPLIMENTS.get(`vision:${clientSessionId}`);
		if (summary && realtimeWs.readyState === WebSocket.READY_STATE_OPEN) {
			console.log(`Injecting vision summary for session ${clientSessionId}`);
			realtimeWs.send(
				JSON.stringify({
					type: 'conversation.item.create',
					item: {
						type: 'message',
						role: 'system',
						content: [{ type: 'text', text: `Vision context: ${summary}` }],
					},
				})
			);
			await env.COMPLIMENTS.delete(`vision:${clientSessionId}`);
		}
	}, 10000);

	const closeHandler = () => {
		console.log('WebSocket session closed.');
		clearInterval(visionInterval);
		if (realtimeWs.readyState === WebSocket.READY_STATE_OPEN) {
			realtimeWs.close(1000, 'Client disconnected');
		}
		if (clientWs.readyState === WebSocket.READY_STATE_OPEN) {
			clientWs.close(1000, 'Upstream disconnected');
		}
	};

	clientWs.addEventListener('close', closeHandler);
	realtimeWs.addEventListener('close', closeHandler);
	clientWs.addEventListener('error', (err) => console.error('Client WS Error:', err));
	realtimeWs.addEventListener('error', (err) => console.error('OpenAI WS Error:', err));
}

export default {
	fetch: router.handle,
}; 