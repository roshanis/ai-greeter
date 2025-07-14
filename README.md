# AI Greeter 🤖

A real-time AI greeter that uses OpenAI's Realtime API for speech interaction and vision capabilities to compliment visitors.

## Features

- 🎤 Real-time speech interaction using OpenAI's Realtime API
- 👁️ Computer vision to analyze visitor appearance
- 💬 Natural conversation with contextual compliments
- 🌐 Browser-based interface with WebRTC
- ⚡ Low-latency audio processing (~300ms)
- 🎨 Beautiful, modern UI with audio visualizer

## Architecture

The application uses a two-lane approach:

1. **Voice Lane**: WebSocket connection to OpenAI Realtime API for speech-to-speech interaction
2. **Vision Lane**: Periodic image capture and analysis via Chat Completions API

```
Browser (Frontend)
├── Camera/Microphone Access
├── WebSocket → Real-time Audio
├── Canvas → Image Capture
└── Vision API Calls

Backend (Node.js/Bun)
├── WebSocket Proxy → OpenAI Realtime API
├── Vision Endpoint → GPT-4o-mini
└── Redis → Session & Vision Context
```

## Prerequisites

- **Node.js 18+** or **Bun** (recommended)
- **Redis server**
- **OpenAI API key** with Realtime API access
- **Modern browser** (Chrome/Edge recommended)

## Quick Start

### 1. Install System Dependencies

**macOS:**
```bash
brew install node redis bun
```

**Linux (Ubuntu/Debian):**
```bash
curl -fsSL https://bun.sh/install | bash
sudo apt-get install redis-server
```

### 2. Setup the Project

```bash
# Clone or download the project
git clone <your-repo-url> ai-greeter
cd ai-greeter

# Run the setup script
chmod +x setup.sh
./setup.sh
```

### 3. Configure Environment

```bash
cd backend
cp env.example .env
# Edit .env and add your OpenAI API key
```

**Required environment variables:**
```env
OPENAI_API_KEY=your_openai_api_key_here
REDIS_HOST=localhost
REDIS_PORT=6379
PORT=3000
```

### 4. Start the Application

**Terminal 1 - Backend:**
```bash
cd backend
bun run dev
```

**Terminal 2 - Frontend:**
```bash
cd frontend
python -m http.server 8000
# Or simply open index.html in Chrome/Edge
```

**Open your browser:**
- Go to `http://localhost:8000` (if using Python server)
- Or open `frontend/index.html` directly

## Usage

1. **Click "Start Greeting"** to begin
2. **Allow camera and microphone access** when prompted
3. **The AI will greet you** and comment on your appearance
4. **Speak naturally** - the AI responds in real-time
5. **Click "Stop"** to end the session

## Project Structure

```
ai-greeter/
├── backend/
│   ├── src/
│   │   └── server.ts          # Main server with WebSocket and vision
│   ├── package.json           # Dependencies and scripts
│   └── env.example           # Environment template
├── frontend/
│   └── index.html            # Single-page application
├── setup.sh                  # Automated setup script
└── README.md                 # This file
```

## Configuration

### Backend Configuration

**Environment Variables:**
- `OPENAI_API_KEY`: Your OpenAI API key
- `REDIS_HOST`: Redis server host (default: localhost)
- `REDIS_PORT`: Redis server port (default: 6379)
- `PORT`: Backend server port (default: 3000)

**Customization Options:**
- **Greeting Style**: Modify the `instructions` in `server.ts`
- **Vision Frequency**: Adjust the interval in frontend code (default: 3s)
- **Audio Quality**: Configure audio format settings in WebSocket setup

### Frontend Configuration

**Key Settings:**
- **Vision Processing**: Every 3 seconds (configurable)
- **Audio Sample Rate**: 16kHz for optimal quality
- **Video Resolution**: 640x480 for balance of quality/performance

## API Costs

- **Realtime API**: $0.06/min input, $0.24/min output
- **Vision API**: ~$0.01 per image (depends on tokens)
- **Estimated Cost**: ~$0.30-0.50 per 5-minute session

## Troubleshooting

### Common Issues

**1. WebSocket Connection Fails**
```bash
# Check if backend is running
curl http://localhost:3000/health

# Verify OpenAI API key
echo $OPENAI_API_KEY
```

**2. Audio Not Working**
- Use Chrome or Edge browser (Safari has limited WebRTC support)
- Check microphone permissions in browser settings
- Ensure HTTPS for production deployment

**3. Vision Processing Slow**
- Reduce image quality or frequency in frontend code
- Check OpenAI API rate limits
- Monitor Redis connection

**4. Redis Connection Issues**
```bash
# Check if Redis is running
redis-cli ping

# Start Redis if not running
redis-server --daemonize yes
```

### Performance Optimization

1. **Reduce Vision Frequency**: Change interval from 3s to 5s
2. **Lower Image Quality**: Reduce JPEG quality from 0.6 to 0.4
3. **Use HTTPS**: Better WebRTC performance in production
4. **Rate Limiting**: Implement for production use

## Development

### Adding Features

**1. Function Calling**
Add tools for controlling IoT devices or screen elements:
```typescript
// In server.ts
const tools = [
  {
    name: "control_lights",
    description: "Control smart lights",
    parameters: { /* ... */ }
  }
];
```

**2. Multi-language Support**
Configure different voice models:
```typescript
voice: req.headers['accept-language']?.includes('es') ? 'nova' : 'alloy'
```

**3. Emotion Detection**
Enhance vision analysis to detect emotions:
```typescript
text: 'Describe this person\'s mood and appearance. Give a friendly compliment.'
```

### Testing

**Backend Testing:**
```bash
cd backend
bun test
```

**Frontend Testing:**
- Open browser developer tools
- Check console for errors
- Test camera/microphone permissions

## Security Considerations

1. **API Keys**: Never expose in frontend code
2. **Rate Limiting**: Implement for production
3. **CORS**: Configure appropriate policies
4. **Data Privacy**: Consider encrypting stored vision data
5. **User Consent**: Implement proper consent flow

## Deployment

### Local Development
- Use the setup script for quick local setup
- Suitable for testing and development

### Production Deployment
1. **Use HTTPS** for WebRTC compatibility
2. **Configure CORS** for your domain
3. **Set up monitoring** for API usage
4. **Implement rate limiting**
5. **Use environment variables** for configuration

### Recommended Hosting
- **Backend**: Railway, Render, or DigitalOcean
- **Frontend**: Vercel, Netlify, or GitHub Pages
- **Redis**: Railway Redis or Redis Cloud

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - feel free to use and modify for your projects!

## Support

If you encounter issues:
1. Check the troubleshooting section
2. Review the console logs
3. Verify your OpenAI API key has Realtime API access
4. Test with Chrome/Edge browsers

---

**Built with ❤️ using OpenAI's Realtime API** 