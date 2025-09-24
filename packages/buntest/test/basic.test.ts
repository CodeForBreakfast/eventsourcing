import { it } from '../src/index.js';
import { Effect } from 'effect';
import { expect } from 'bun:test';

it.effect('basic effect test', () =>
  Effect.gen(function* () {
    const result = yield* Effect.succeed(42);
    expect(result).toBe(42);
  })
);

it.live('basic live test', () =>
  Effect.gen(function* () {
    const result = yield* Effect.succeed('hello');
    expect(result).toBe('hello');
  })
);
