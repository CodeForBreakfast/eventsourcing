import { Data } from 'effect';

export class CommandProcessingError extends Data.TaggedError('CommandProcessingError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export class CommandRoutingError extends Data.TaggedError('CommandRoutingError')<{
  readonly target: string;
  readonly message: string;
}> {}
