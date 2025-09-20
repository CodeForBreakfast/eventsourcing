# @codeforbreakfast/eventsourcing

A comprehensive event sourcing library built on Effect for TypeScript applications.

## Design Philosophy

This library prioritizes leveraging Effect's existing APIs and patterns rather than creating new abstractions. We aim to expose event sourcing capabilities through familiar Effect constructs like `Stream`, `Effect`, `Layer`, and `Schema` - ensuring developers who know Effect can immediately be productive without learning proprietary APIs.

## Packages

This monorepo contains the following packages:

### [@codeforbreakfast/eventsourcing-store](./packages/eventsourcing-store)

Core event sourcing types and storage implementations including SQL and in-memory stores.

### [@codeforbreakfast/eventsourcing-aggregates](./packages/eventsourcing-aggregates)

Aggregate root patterns for domain-driven design with event sourcing.

### [@codeforbreakfast/eventsourcing-projections](./packages/eventsourcing-projections)

Read-side projection building from event streams.

### [@codeforbreakfast/eventsourcing-websocket-transport](./packages/eventsourcing-websocket-transport)

Real-time WebSocket transport for event streaming.

## Installation

```bash
# Install individual packages as needed
npm install @codeforbreakfast/eventsourcing-store
npm install @codeforbreakfast/eventsourcing-aggregates
npm install @codeforbreakfast/eventsourcing-projections
npm install @codeforbreakfast/eventsourcing-websocket-transport
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
