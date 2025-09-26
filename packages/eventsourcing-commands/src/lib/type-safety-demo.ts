/**
 * This file demonstrates the compile-time type safety
 * It should show TypeScript errors when trying to use invalid command names
 */

import { Schema, Effect } from 'effect';
import {
  buildCommandRegistrations,
  createCommandRegistration,
  createWireCommandSchema,
  createTypedCommandRegistryService,
} from './command-registry';
import { CommandHandler, DomainCommand } from './commands';

// Define a simple command
const TestPayload = Schema.Struct({
  message: Schema.String,
});

const testHandler: CommandHandler<DomainCommand<typeof TestPayload.Type>> = {
  handle: () =>
    Effect.succeed({
      _tag: 'Success' as const,
      position: { streamId: 'test' as any, eventNumber: 1 },
    }),
};

// Create registrations with known command names
const registrations = buildCommandRegistrations({
  ValidCommand: createCommandRegistration(TestPayload, testHandler),
  AnotherValidCommand: createCommandRegistration(TestPayload, testHandler),
});

// Create service and schema
const ServiceTag = createTypedCommandRegistryService<typeof registrations>();
const WireCommandSchema = createWireCommandSchema(registrations);

// ✅ These should work fine - valid command names
const validCommand1 = {
  id: 'cmd-1',
  target: 'test',
  name: 'ValidCommand' as const,
  payload: { message: 'hello' },
};

const validCommand2 = {
  id: 'cmd-2',
  target: 'test',
  name: 'AnotherValidCommand' as const,
  payload: { message: 'world' },
};

// ❌ This should cause a TypeScript error - uncomment to test:
// const invalidCommand = {
//   id: 'cmd-3',
//   target: 'test',
//   name: 'InvalidCommand' as const, // ❌ Type error: not assignable to valid names
//   payload: { message: 'fail' },
// };

// ✅ Schema validation should accept valid commands
const parsedValid1 = Schema.decodeUnknownSync(WireCommandSchema)(validCommand1);
const parsedValid2 = Schema.decodeUnknownSync(WireCommandSchema)(validCommand2);

// ❌ Schema validation should reject invalid commands at runtime
try {
  const invalidWireCommand = {
    id: 'cmd-4',
    target: 'test',
    name: 'UnknownCommand', // This will be rejected by schema
    payload: { message: 'fail' },
  };
  Schema.decodeUnknownSync(WireCommandSchema)(invalidWireCommand);
  console.log('This should not execute - schema should reject invalid command');
} catch (error) {
  console.log('✅ Schema correctly rejected invalid command:', error.message);
}

// Type demonstration: the valid command names are constrained
type ValidCommandNames = keyof typeof registrations;
// Result: "ValidCommand" | "AnotherValidCommand"

// This demonstrates exhaustive type checking - if you add a new command
// to registrations, TypeScript will force you to handle it everywhere

export type { ValidCommandNames };
export { validCommand1, validCommand2, parsedValid1, parsedValid2 };
