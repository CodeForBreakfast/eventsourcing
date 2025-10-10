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

// Should NOT fail - as const in Effect callback (safe literal type narrowing)
const constAssertionInCallback = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(1),
  Effect.as({ type: 'TodoCompleted' as const, data: { completedAt: new Date() } })
);

// Should NOT fail - as const in object within Effect.flatMap
const constAssertionInFlatMap = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed(true),
  Effect.flatMap((completed) =>
    // eslint-disable-next-line effect/prefer-match-over-ternary -- Testing as const, not ternary patterns
    completed
      ? Effect.succeed([
          {
            type: 'TodoCompleted' as const,
            metadata: { occurredAt: new Date() },
            data: { completedAt: new Date() },
          },
        ])
      : Effect.succeed([])
  )
);

// Should NOT fail - as const for string literal
const constAssertionStringLiteral = pipe(
  // eslint-disable-next-line effect/no-pipe-first-arg-call -- Testing first arg in pipe
  Effect.succeed('test'),
  Effect.as('TodoCreated' as const)
);
