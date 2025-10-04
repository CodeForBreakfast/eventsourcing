import { Context, Effect, Layer } from 'effect';
import { CommandContextError } from './commandContextError';

export interface CommandContextService<TInitiator> {
  readonly getInitiator: Effect.Effect<TInitiator, CommandContextError>;
}

export const CommandContext = <TInitiator>() =>
  Context.GenericTag<CommandContextService<TInitiator>>('CommandContext');

export const CommandContextTest = <TInitiator>(initiator: TInitiator) =>
  Layer.succeed(CommandContext<TInitiator>(), {
    getInitiator: Effect.succeed(initiator),
  });
