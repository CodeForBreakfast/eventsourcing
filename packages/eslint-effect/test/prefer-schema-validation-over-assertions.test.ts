import { pipe, Effect } from 'effect';

type ProtocolMessage = { readonly type: 'command'; readonly id: string };

// Should fail - type assertion in Effect.flatMap
const typeAssertionInFlatMap = pipe(
  Effect.succeed({ type: 'command', id: '123' }),
  Effect.flatMap((msg) => {
    // eslint-disable-next-line effect/prefer-schema-validation-over-assertions
    const typed = msg as ProtocolMessage;
    return Effect.succeed(typed.id);
  })
);

// Should fail - type assertion in Effect.map
const typeAssertionInMap = pipe(
  Effect.succeed({ type: 'command', id: '123' }),
  // eslint-disable-next-line effect/prefer-schema-validation-over-assertions
  Effect.map((msg) => (msg as ProtocolMessage).id)
);

// Should fail - type assertion in Effect.tap
const typeAssertionInTap = pipe(
  Effect.succeed({ type: 'command', id: '123' }),
  Effect.tap((msg) => {
    // eslint-disable-next-line effect/prefer-schema-validation-over-assertions
    const typed = msg as ProtocolMessage;
    return Effect.log(typed.id);
  })
);

// Should fail - double assertion (as unknown as T)
const doubleAssertion = pipe(
  Effect.succeed('some data'),
  Effect.flatMap((data) => {
    // eslint-disable-next-line effect/prefer-schema-validation-over-assertions
    const msg = data as unknown as ProtocolMessage;
    return Effect.succeed(msg.id);
  })
);

// Should NOT fail - type assertion outside Effect callback
const typeAssertionOutside = { type: 'command', id: '123' } as ProtocolMessage;

// Should NOT fail - no type assertion
const noTypeAssertion = pipe(
  Effect.succeed<ProtocolMessage>({ type: 'command', id: '123' }),
  Effect.map((msg) => msg.id)
);

// Should NOT fail - as const in Effect callback (safe literal type narrowing)
const constAssertionInCallback = pipe(
  Effect.succeed(1),
  Effect.as({ type: 'TodoCompleted' as const, data: { completedAt: new Date() } })
);

// Should NOT fail - as const in object within Effect.flatMap
const constAssertionInFlatMap = pipe(
  Effect.succeed(true),
  Effect.flatMap((completed) =>
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
const constAssertionStringLiteral = pipe(Effect.succeed('test'), Effect.as('TodoCreated' as const));
