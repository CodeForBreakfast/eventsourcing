import { pipe, Effect } from 'effect';

type ProtocolMessage = { readonly type: 'command'; readonly id: string };

// Should fail - type assertion in Effect.flatMap
const typeAssertionInFlatMap = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed({ type: 'command', id: '123' }),
  Effect.flatMap((msg) => {
    // eslint-disable-next-line effect/prefer-schema-validation-over-assertions -- Testing type assertion in flatMap
    const typed = msg as ProtocolMessage;
    return Effect.succeed(typed.id);
  })
);

// Should fail - type assertion in Effect.map
const typeAssertionInMap = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed({ type: 'command', id: '123' }),
  // eslint-disable-next-line effect/prefer-schema-validation-over-assertions -- Testing type assertion in map
  Effect.map((msg) => (msg as ProtocolMessage).id)
);

// Should fail - type assertion in Effect.tap
const typeAssertionInTap = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed({ type: 'command', id: '123' }),
  Effect.tap((msg) => {
    // eslint-disable-next-line effect/prefer-schema-validation-over-assertions -- Testing type assertion in tap
    const typed = msg as ProtocolMessage;
    return Effect.log(typed.id);
  })
);

// Should fail - double assertion (as unknown as T)
const doubleAssertion = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed('some data'),
  Effect.flatMap((data) => {
    // eslint-disable-next-line effect/prefer-schema-validation-over-assertions -- Testing double type assertion
    const msg = data as unknown as ProtocolMessage;
    return Effect.succeed(msg.id);
  })
);

// Should NOT fail - type assertion outside Effect callback
const typeAssertionOutside = { type: 'command', id: '123' } as ProtocolMessage;

// Should NOT fail - no type assertion
const noTypeAssertion = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed<ProtocolMessage>({ type: 'command', id: '123' }),
  Effect.map((msg) => msg.id)
);
