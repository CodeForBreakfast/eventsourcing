import { Data } from 'effect';

export class CommandContextError extends Data.TaggedError('CommandContextError')<{
  readonly message: string;
  readonly reason: Error;
}> {}
