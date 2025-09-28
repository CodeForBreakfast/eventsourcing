/**
 * Basic In-Memory Transport Tests
 *
 * Basic tests for acceptor creation. All other transport behaviors
 * are covered by contract tests.
 */

import { describe, it, expect } from '@codeforbreakfast/buntest';
import { Effect, pipe } from 'effect';
import { InMemoryAcceptor } from '../index';

describe('InMemory Transport Basic Tests', () => {
  it.effect('should create acceptor without errors', () =>
    pipe(
      InMemoryAcceptor.make(),
      Effect.map((acceptorResult) => {
        expect(acceptorResult).toBeDefined();
        expect(acceptorResult.start).toBeDefined();
      })
    )
  );
});
