import { Effect, Chunk } from 'effect';

// ============================================================================
// SHOULD TRIGGER - Used once or twice, no semantic value
// ============================================================================

// eslint-disable-next-line effect/no-unnecessary-function-alias -- Testing alias used once
const succeedEffect = Effect.succeed;

const useOnce = () => succeedEffect(42);

// eslint-disable-next-line effect/no-unnecessary-function-alias -- Testing alias used twice
const toArray = Chunk.toReadonlyArray;

const useTwice = () => {
  const chunk1 = Chunk.make(1, 2, 3);
  const chunk2 = Chunk.make(4, 5, 6);
  return [toArray(chunk1), toArray(chunk2)];
};

// eslint-disable-next-line effect/no-unnecessary-function-alias -- Testing simple identifier alias
const syncEffect = Effect.sync;

// eslint-disable-next-line effect/prefer-effect-platform -- Test utility
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

// eslint-disable-next-line effect/no-eta-expansion -- Testing that alias rule doesn't trigger on non-aliases
const notAnAlias = (x: number) => wrappedFunction(x);

// ============================================================================
// SHOULD NOT TRIGGER - Computed member expressions add semantic value
// ============================================================================

const events = [{ type: 'created' }, { type: 'updated' }];
const firstEvent = events[0];
const secondEvent = events[1];

const useIndexedAccess = () => {
  // eslint-disable-next-line effect/no-if-statement -- Test helper guards
  if (!firstEvent) throw new Error('Expected first event');
  // eslint-disable-next-line effect/no-if-statement -- Test helper guards
  if (!secondEvent) throw new Error('Expected second event');
  return [firstEvent.type, secondEvent.type];
};

// ============================================================================
// DEMONSTRATES THE RULE - This will trigger a warning
// ============================================================================

// This demonstrates an unnecessary alias that provides no real value
// The name "toArraySafely" doesn't add meaningful information over "toReadonlyArray"
// eslint-disable-next-line effect/no-unnecessary-function-alias -- Intentional demonstration of the rule
const toArraySafely = Chunk.toReadonlyArray;

const useSemantic = () => {
  const chunk = Chunk.make(1, 2, 3);
  return toArraySafely(chunk);
};
