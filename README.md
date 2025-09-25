# @codeforbreakfast/eventsourcing

A comprehensive event sourcing library built on Effect for TypeScript applications.

## Design Philosophy

This library prioritizes leveraging Effect's existing APIs and patterns rather than creating new abstractions. We aim to expose event sourcing capabilities through familiar Effect constructs like `Stream`, `Effect`, `Layer`, and `Schema` - ensuring developers who know Effect can immediately be productive without learning proprietary APIs.

## Packages

This monorepo contains the following packages:

### Core Packages

#### [@codeforbreakfast/eventsourcing-store](./packages/eventsourcing-store)

Core event sourcing types, interfaces, and in-memory storage implementation. This is the foundation package that defines the EventStore interface and provides an in-memory implementation for development and testing.

#### [@codeforbreakfast/eventsourcing-store-postgres](./packages/eventsourcing-store-postgres)

PostgreSQL implementation of the EventStore interface. Includes SQL migrations, connection management, and LISTEN/NOTIFY support for real-time event streaming.

#### [@codeforbreakfast/eventsourcing-aggregates](./packages/eventsourcing-aggregates)

Aggregate root patterns for domain-driven design with event sourcing. Focuses purely on write-side concerns and command handling.

#### [@codeforbreakfast/eventsourcing-projections](./packages/eventsourcing-projections)

Read-side projection building from event streams. Handles the transformation of events into read models.

### Transport Layer

#### [@codeforbreakfast/eventsourcing-transport-contracts](./packages/eventsourcing-transport-contracts)

Transport layer contracts and interfaces for message delivery systems. Provides protocol-agnostic abstractions for event streaming.

#### [@codeforbreakfast/eventsourcing-transport-inmemory](./packages/eventsourcing-transport-inmemory)

In-memory transport implementation for testing and development. Provides immediate message delivery without network overhead.

#### [@codeforbreakfast/eventsourcing-transport-websocket](./packages/eventsourcing-transport-websocket)

WebSocket transport implementation for real-time event streaming over WebSocket connections.

### Protocol Layer

#### [@codeforbreakfast/eventsourcing-protocol](./packages/eventsourcing-protocol)

Protocol implementation for event sourcing messages. Handles message formatting, serialization, and routing.

### WebSocket Integration

#### [@codeforbreakfast/eventsourcing-websocket](./packages/eventsourcing-websocket)

High-level WebSocket integration combining transport and protocol layers for complete real-time event streaming functionality.

### Testing

#### [@codeforbreakfast/eventsourcing-testing-contracts](./packages/eventsourcing-testing-contracts)

Testing contracts and utilities for verifying event sourcing implementations. Provides standard test suites for compliance testing.

## Installation

```bash
# Core packages
npm install @codeforbreakfast/eventsourcing-store
npm install @codeforbreakfast/eventsourcing-store-postgres  # PostgreSQL implementation (optional)
npm install @codeforbreakfast/eventsourcing-aggregates      # Aggregate patterns for write-side
npm install @codeforbreakfast/eventsourcing-projections     # Projection patterns for read-side

# Transport layer (choose one or more)
npm install @codeforbreakfast/eventsourcing-transport-contracts  # Transport contracts
npm install @codeforbreakfast/eventsourcing-transport-inmemory   # In-memory transport for testing
npm install @codeforbreakfast/eventsourcing-transport-websocket  # WebSocket transport

# Protocol layer
npm install @codeforbreakfast/eventsourcing-protocol               # Message protocol

# WebSocket integration (high-level)
npm install @codeforbreakfast/eventsourcing-websocket            # Complete WebSocket functionality

# Testing utilities
npm install @codeforbreakfast/eventsourcing-testing-contracts    # Testing contracts
```

## Requirements

All packages require:

- Effect ^3.17.0 as a peer dependency
- TypeScript 5.x

## Development

### Prerequisites

- Bun
- Docker (for running tests with PostgreSQL)

### Setup

```bash
# Install dependencies
bun install
```

### Running Tests

The test suite includes both in-memory and PostgreSQL tests. To run tests:

1. Start the PostgreSQL database:

```bash
docker-compose up -d
```

2. Run tests with environment variables:

```bash
TEST_PG_USERNAME=postgres TEST_PG_PASSWORD=postgres TEST_PG_DATABASE=test TEST_PG_HOST=localhost TEST_PG_PORT=5432 bun run test
```

### Other Commands

```bash
# Build all packages
bun run build

# Lint code
bun run lint

# Type check
bun run check
```

## License

MIT
