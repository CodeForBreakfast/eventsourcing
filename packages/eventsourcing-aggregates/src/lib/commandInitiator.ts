import { Context, Effect, Layer, Option, Schema } from 'effect';

// Mock PersonId for now - replace with actual implementation
const PersonId = Schema.String.pipe(Schema.brand('PersonId'));
type PersonId = typeof PersonId.Type;
import { CurrentUserError } from './currentUser';

export const CommandInitiatorId = Schema.Union(PersonId);
export type CommandInitiatorId = typeof CommandInitiatorId.Type;

export class CommandContext extends Context.Tag('CommandContext')<
  CommandContext,
  {
    readonly getInitiatorId: Effect.Effect<Option.Option<CommandInitiatorId>, CurrentUserError>;
  }
>() {}

export const CommandContextTest = (initiatorId: Readonly<Option.Option<CommandInitiatorId>>) =>
  Layer.succeed(CommandContext, {
    getInitiatorId: Effect.succeed(initiatorId),
  });
