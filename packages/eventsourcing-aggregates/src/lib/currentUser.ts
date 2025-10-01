// Mock PersonId for now - replace with actual implementation
import { Schema } from 'effect';
const PersonId = Schema.String.pipe(Schema.brand('PersonId'));
type PersonId = typeof PersonId.Type;
import { Context, Data, Option } from 'effect';

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
