import { Effect, Chunk } from 'effect';

// ============================================================================
// SHOULD TRIGGER - Used once or twice, no semantic value
// ============================================================================

const succeedEffect = Effect.succeed;

const useOnce = () => succeedEffect(42);

const toArray = Chunk.toReadonlyArray;

const useTwice = () => {
  const chunk1 = Chunk.make(1, 2, 3);
  const chunk2 = Chunk.make(4, 5, 6);
  return [toArray(chunk1), toArray(chunk2)];
};

const syncEffect = Effect.sync;

const useSyncOnce = () => syncEffect(() => console.log('test'));

// ============================================================================
// SHOULD NOT TRIGGER - Used more than twice
// ============================================================================

const failEffect = Effect.fail;

const useMultipleTimes = () =>
  Effect.all([failEffect('error1'), failEffect('error2'), failEffect('error3')]);

// ============================================================================
// SHOULD NOT TRIGGER - Exported (part of public API)
// ============================================================================

export const publicAlias = Effect.succeed;

// ============================================================================
// SHOULD NOT TRIGGER - Not a direct alias
// ============================================================================

const wrappedFunction = (x: number) => Effect.succeed(x * 2);

const notAnAlias = (x: number) => wrappedFunction(x);

// ============================================================================
// SHOULD NOT TRIGGER - Computed member expressions add semantic value
// ============================================================================

const events = [{ type: 'created' }, { type: 'updated' }];
const firstEvent = events[0];
const secondEvent = events[1];

const useIndexedAccess = () => {
  if (!firstEvent) throw new Error('Expected first event');

  if (!secondEvent) throw new Error('Expected second event');
  return [firstEvent.type, secondEvent.type];
};

// ============================================================================
// DEMONSTRATES THE RULE - This will trigger a warning
// ============================================================================

// This demonstrates an unnecessary alias that provides no real value
// The name "toArraySafely" doesn't add meaningful information over "toReadonlyArray"

const toArraySafely = Chunk.toReadonlyArray;

const useSemantic = () => {
  const chunk = Chunk.make(1, 2, 3);
  return toArraySafely(chunk);
};
