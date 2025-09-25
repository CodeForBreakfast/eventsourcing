import { describe, it, expect } from 'bun:test';
import { Effect } from 'effect';
import * as MainExports from '../index';

describe('InMemoryStore Exports', () => {
  it('should export InMemoryStore class', () => {
    expect(MainExports.InMemoryStore).toBeDefined();
    expect(typeof MainExports.InMemoryStore).toBe('function');
  });

  it('should export makeInMemoryStore function', () => {
    expect(MainExports.makeInMemoryStore).toBeDefined();
    expect(typeof MainExports.makeInMemoryStore).toBe('function');
  });

  it('should be able to create an in-memory store for testing', async () => {
    type TestEvent = { type: 'test'; data: string };

    const store = await Effect.runPromise(MainExports.makeInMemoryStore<TestEvent>());
    expect(store).toBeDefined();
    expect(store).toBeInstanceOf(MainExports.InMemoryStore);

    const eventStore = await Effect.runPromise(MainExports.makeInMemoryEventStore(store));
    expect(eventStore).toBeDefined();
    expect(typeof eventStore.append).toBe('function');
    expect(typeof eventStore.read).toBe('function');
    expect(typeof eventStore.subscribe).toBe('function');
  });
});
