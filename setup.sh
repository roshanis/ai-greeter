#!/bin/bash

echo "🚀 Setting up AI Greeter..."

# Check if required tools are installed
command -v bun >/dev/null 2>&1 || { echo "❌ Bun is required but not installed. Please install it first: curl -fsSL https://bun.sh/install | bash"; exit 1; }
command -v redis-server >/dev/null 2>&1 || { echo "❌ Redis is required but not installed. Please install it first: brew install redis"; exit 1; }

# Create directories if they don't exist
mkdir -p backend/src
mkdir -p frontend

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
bun install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    cp env.example .env
    echo "📝 Created .env file. Please add your OpenAI API key!"
    echo "Edit backend/.env and add your OPENAI_API_KEY"
fi

# Check if Redis is running, start if not
if ! pgrep -x "redis-server" > /dev/null; then
    echo "🔴 Starting Redis server..."
    redis-server --daemonize yes
    sleep 2
fi

# Test Redis connection
if redis-cli ping > /dev/null 2>&1; then
    echo "✅ Redis is running"
else
    echo "❌ Redis failed to start"
    exit 1
fi

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Add your OpenAI API key to backend/.env"
echo "2. Run 'cd backend && bun run dev' to start the server"
echo "3. Open frontend/index.html in Chrome or Edge"
echo ""
echo "�� Happy greeting!" 