#!/bin/bash

# Build Replit database URL from PG environment variables
REPLIT_DB_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}?sslmode=require"

echo "🔄 Switching from Railway (offline) to Replit database..."
echo "📍 Replit DB: ${PGHOST}"

# Export for current session
export LOADTRACKER_DB_URL="$REPLIT_DB_URL"

echo "✅ LOADTRACKER_DB_URL updated to use Replit database"
echo ""
echo "⚠️  NOTE: This is temporary for the current session."
echo "To make it permanent, update your secrets/environment variables."

# Show the new URL (masked password)
echo ""
echo "New LOADTRACKER_DB_URL: $(echo $LOADTRACKER_DB_URL | sed 's/:\/\/[^:]*:[^@]*@/:\/\/***:***@/')"
