## What eventsourcing owns

eventsourcing is a set of event sourcing libraries for TypeScript, built on Effect and published to npm as the `@codeforbreakfast/eventsourcing-*` packages. An agent here decides and changes:

- the event store interface and its in-memory, filesystem and PostgreSQL implementations
- the write side and read side: aggregates, commands and projections
- the protocol, the transport contracts and their in-memory and WebSocket implementations, and the server that puts them together
- the testing contracts that any store or transport implementation can run against itself
- `bun-test-effect` and `eslint-effect`, the Effect testing and lint helpers published from this repo
- the todo-app example and the docs under `docs/`
- versioning, changesets and releases of every package above

## What it does not own

- **Effect itself** belongs to the upstream Effect project. An agent here adapts to Effect's API and reports bugs upstream, and does not patch or fork it.
- **Bun, Turbo, PostgreSQL and the other tools** belong to their upstream projects.
- **An application built on these libraries** belongs to whoever builds it. That covers its domain events, aggregates, projections and read models.
- **A deployment** belongs to whoever runs it. That covers the PostgreSQL database, its migrations as applied, the hosting, the credentials, and how a WebSocket server is exposed to a network.
- **The events in a user's store** belong to that user. An agent here never needs real event data, and invents any example it uses.

## Setup

Tool versions are pinned in the mise config. Run `mise install`, then `bun install`. Use Bun, not node or npm.

## Building and testing

Run every task through turbo:

- `turbo all` runs the build, lint, tests and repository checks that CI runs. It must pass before a change is ready.
- `turbo test --filter=<package>` runs one package's tests.
- The PostgreSQL store's tests need the database from `docker-compose up -d`. The `TEST_PG_*` variables in `.mise.toml` point at it.

The `eslint-effect` lint rules and the Effect language service enforce the Effect conventions a change must follow. `bun install` patches the language service into TypeScript. Fix what they report rather than disabling them.

## Contributing

- Branch from the latest `main` and submit every change as a pull request.
- Write the pull request title as a conventional commit.
- Add or update a changeset in `.changeset/` for any change to a published package. Write it for the package's consumer: say what they need to know, not just what changed.
- Packages are released by hand from the GitHub UI, not automatically.
