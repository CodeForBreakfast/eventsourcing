import { Data, Cause } from 'effect';

export class TransportError extends Data.TaggedError('TransportError')<{
  readonly message: string;
  readonly cause?: Cause.Cause<unknown>;
}> {}

export class TransportConnectionError extends Data.TaggedError('TransportConnectionError')<{
  readonly message: string;
  readonly cause?: Cause.Cause<unknown>;
  readonly retryable: boolean;
}> {
  static retryable = (message: string, cause?: Cause.Cause<unknown>) =>
    new TransportConnectionError({
      message,
      retryable: true,
      ...(cause && { cause }),
    });

  static fatal = (message: string, cause?: Cause.Cause<unknown>) =>
    new TransportConnectionError({
      message,
      retryable: false,
      ...(cause && { cause }),
    });
}

export class TransportSubscriptionError extends Data.TaggedError('TransportSubscriptionError')<{
  readonly message: string;
  readonly streamId: string;
  readonly cause?: Cause.Cause<unknown>;
}> {}

export class TransportPublishError extends Data.TaggedError('TransportPublishError')<{
  readonly message: string;
  readonly streamId: string;
  readonly cause?: Cause.Cause<unknown>;
}> {}
