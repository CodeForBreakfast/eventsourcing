/**
 * Filesystem-based EventStore implementation for learning and debugging
 *
 * This package provides a simple filesystem-based event store that stores each event
 * as a separate JSON file. It's designed for educational purposes and debugging,
 * not for production use.
 *
 * ## Features
 *
 * - **Human-readable storage**: Events are stored as formatted JSON files
 * - **Stream isolation**: Each stream gets its own directory
 * - **Sequential naming**: Events are named by their position (0.json, 1.json, etc.)
 * - **Easy inspection**: Just open the files in any text editor
 * - **Full EventStore interface**: Compatible with all eventsourcing packages
 *
 * ## Example Usage
 *
 * ```typescript
 * import { make, makeFileSystemEventStore } from '@codeforbreakfast/eventsourcing-store-filesystem';
 * import { BunFileSystem, BunPath } from '@effect/platform-bun';
 * import { Effect, pipe } from 'effect';
 *
 * // Also works with Node.js using NodeFileSystem and NodePath from '@effect/platform-node'
 * const program = pipe(
 *   make({ baseDir: './event-data' }),
 *   Effect.flatMap(makeFileSystemEventStore),
 *   Effect.provide(BunFileSystem.layer),
 *   Effect.provide(BunPath.layer)
 * );
 * ```
 *
 * ## Directory Structure
 *
 * ```
 * event-data/
 *   stream-1/
 *     0.json
 *     1.json
 *     2.json
 *   stream-2/
 *     0.json
 *     1.json
 * ```
 *
 * @since 0.1.0
 */

export {
  make,
  makeFileSystemEventStore,
  type FileSystemStore,
  type FileSystemStoreConfig,
} from './lib/index';
