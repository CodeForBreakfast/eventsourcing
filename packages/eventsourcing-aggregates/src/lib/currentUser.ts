// Mock PersonId for now - replace with actual implementation
import { Context, Data, Option, pipe, Schema } from 'effect';
const PersonId = pipe(Schema.String, Schema.brand('PersonId'));
type PersonId = typeof PersonId.Type;

export class CurrentUserError extends Data.TaggedError('CurrentUserError')<{
  readonly message: string;
  readonly reason: Error;
}> {}

export class CurrentUser extends Context.Tag('CurrentUser')<
  CurrentUser,
  {
    readonly getCurrentUser: () => Readonly<Option.Option<PersonId>>;
  }
>() {}
