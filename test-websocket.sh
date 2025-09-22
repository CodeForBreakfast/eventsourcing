#!/bin/bash
set -e

echo "Building dependencies and running WebSocket transport tests..."

# Build transport-contracts first
echo "Building transport-contracts..."
cd packages/eventsourcing-transport-contracts
bun run build

# Build testing-contracts
echo "Building testing-contracts..."
cd ../eventsourcing-testing-contracts
bun run build

# Now run WebSocket tests
echo "Running WebSocket transport tests..."
cd ../eventsourcing-transport-websocket
bun test websocket-transport.test.ts

echo "Test run complete!"