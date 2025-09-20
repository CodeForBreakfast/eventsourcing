# @codeforbreakfast/eventsourcing

A comprehensive event sourcing library built on Effect for TypeScript applications.

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

```bash
# Install dependencies
bun install

# Build all packages
bun run build

# Run tests
bun run test

# Lint code
bun run lint

# Type check
bun run check
```

## License

MIT