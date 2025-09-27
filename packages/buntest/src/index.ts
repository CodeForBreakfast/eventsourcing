/**
 * Adapted from @effect/vitest
 * Original work: Copyright (c) 2025 Effectful Technologies Inc.
 * Modified work: Copyright (c) 2025 CodeForBreakfast
 *
 * @since 1.0.0
 */
import type * as Duration from 'effect/Duration';
import type * as Effect from 'effect/Effect';
import * as Logger from 'effect/Logger';
import { test, expect, describe, afterAll, beforeAll, beforeEach, afterEach } from 'bun:test';
import * as internal from './internal/internal.js';

/**
 * @since 1.0.0
 */
export * from 'bun:test';
export { test, expect, describe, afterAll, beforeAll, beforeEach, afterEach };

/**
 * @since 1.0.0
 */
export * from './types.js';

/**
 * @since 1.0.0
 */
export * from './utils.js';

/**
 * @since 1.0.0
 */
export const addEqualityTesters: () => void = internal.addEqualityTesters;

/**
 * @since 1.0.0
 */
export const effect = internal.effect;

/**
 * @since 1.0.0
 */
export const scoped = internal.scoped;

/**
 * @since 1.0.0
 */
export const live = internal.live;

/**
 * @since 1.0.0
 */
export const scopedLive = internal.scopedLive;

/**
 * Share a `Layer` between multiple tests, optionally wrapping
 * the tests in a `describe` block if a name is provided.
 *
 * @since 1.0.0
 */
export const layer = internal.layer;

/**
 * @since 1.0.0
 */
export const flakyTest: <A, E, R>(
  self: Effect.Effect<A, E, R>,
  timeout?: Duration.DurationInput
) => Effect.Effect<A, never, R> = internal.flakyTest;

/**
 * A silent logger that discards all log messages, useful for testing.
 *
 * @since 1.0.0
 */
export const silentLogger = Logger.replace(
  Logger.defaultLogger,
  Logger.make(() => {})
);

/** @ignored */
const methods = { effect, live, flakyTest, scoped, scopedLive, layer } as const;

/**
 * @since 1.0.0
 */
export const it = Object.assign(test, methods);
