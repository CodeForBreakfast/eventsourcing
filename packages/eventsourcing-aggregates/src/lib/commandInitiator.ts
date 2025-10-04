import { Context, Effect, Layer, Option } from 'effect';
import { CurrentUserError } from './currentUser';

export interface CommandContextService<TInitiator> {
  readonly getInitiator: Effect.Effect<Option.Option<TInitiator>, CurrentUserError>;
}

export const CommandContext = <TInitiator>() =>
  Context.GenericTag<CommandContextService<TInitiator>>('CommandContext');

export const CommandContextTest = <TInitiator>(initiator: Readonly<Option.Option<TInitiator>>) =>
  Layer.succeed(CommandContext<TInitiator>(), {
    getInitiator: Effect.succeed(initiator),
  });
