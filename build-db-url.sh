#!/bin/bash

# Build the actual connection string using real values
ACTUAL_URL="postgresql://${PGUSER}:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}?sslmode=require"

echo "📋 Copy this EXACT value into your LOADTRACKER_DB_URL secret:"
echo ""
echo "$ACTUAL_URL"
echo ""
echo "👆 Copy everything above this line (the whole postgresql:// string)"
