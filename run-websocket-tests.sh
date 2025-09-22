#!/bin/bash

# Run WebSocket transport tests with TDD approach
echo "Running WebSocket Transport Tests..."
cd packages/eventsourcing-transport-websocket
bun test --watch websocket-transport.test.ts