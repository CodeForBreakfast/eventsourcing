/**
 * @codeforbreakfast/eventsourcing-commands
 *
 * Multi-layer command architecture for event sourcing.
 * Supports wire commands (external), local commands (internal), and direct aggregate access.
 *
 * Usage Patterns:
 * - WireCommand: External APIs, validation required, unknown data
 * - LocalCommand: Internal services, compile-time safety, no validation overhead
 * - Direct Aggregates: Maximum performance, complex workflows, full control
 */

export * from './lib/commands';
export * from './lib/command-registry';
export * from './lib/examples';
export * from './lib/multilayer-examples';
