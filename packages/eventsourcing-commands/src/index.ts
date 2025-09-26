/**
 * @codeforbreakfast/eventsourcing-commands
 *
 * Wire command validation and dispatch for event sourcing systems.
 * Provides the external boundary layer for command processing.
 *
 * Usage:
 * - Wire Commands: External APIs requiring validation
 * - Aggregate Commands: Use makeAggregateRoot from @codeforbreakfast/eventsourcing-aggregates
 */

export * from './lib/commands';
export * from './lib/command-registry';
