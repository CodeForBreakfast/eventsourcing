/**
 * @codeforbreakfast/eventsourcing-commands
 *
 * Strongly typed command validation and dispatch for event sourcing systems.
 * Features a typed command registry that ensures compile-time safety and exhaustive validation.
 *
 * Key Features:
 * - defineCommand: Create strongly typed command definitions
 * - createRegistration: Pair commands with handlers
 * - makeCommandRegistry: Build type-safe command registries
 * - Compile-time duplicate detection and schema consistency
 * - Exhaustive validation with discriminated union schemas
 *
 * Usage:
 * - Wire Commands: External APIs requiring validation
 * - Domain Commands: Validated internal representations
 * - Typed Registry: Compile-time safe command dispatch
 */

export * from './lib/commands';
export * from './lib/command-registry';
