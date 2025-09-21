// Mock PersonId for now - replace with actual implementation
import { Schema } from 'effect';
const PersonId = Schema.String.pipe(Schema.brand('PersonId'));
type PersonId = typeof PersonId.Type;
import { Data, Effect, Option } from 'effect';

export class CurrentUserError extends Data.TaggedError('CurrentUserError')<{
  message: string;
  reason: Error;
}> {}

export interface CurrentUserServiceInterface {
  readonly getCurrentUser: () => Option.Option<PersonId>;
}

export class CurrentUser extends Effect.Tag('CurrentUser')<
  CurrentUser,
  CurrentUserServiceInterface
>() {}
