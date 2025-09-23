#!/bin/bash

echo "🚀 Starting Railway deployment setup..."

# Run database migrations
echo "📊 Running database migrations..."
npm run db:push --force

echo "✅ Railway deployment setup complete!"