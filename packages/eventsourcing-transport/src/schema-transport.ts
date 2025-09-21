import { Effect, Stream, Duration, Schema, pipe, ParseResult } from 'effect';
import {
  TransportConnectionError,
  TransportPublishError,
  TransportSubscriptionError,
} from './errors.js';
import type { TransportHealth, TransportMetrics, SubscriptionOptions } from './types.js';

/**
 * Protocol message types for transport layer communication.
 * These define the shape of messages that flow through the transport,
 * regardless of the underlying encoding (JSON, protobuf, etc).
 */

export interface ProtocolMessage<TPayload = unknown, TStreamId = string> {
  readonly streamId: TStreamId;
  readonly payload: TPayload;
  readonly position?: number | undefined;
  readonly timestamp: Date;
  readonly metadata?: Record<string, unknown> | undefined;
}

/**
 * Transport-specific encoding configuration.
 * Each transport implementation defines how to encode/decode messages
 * and what the wire format looks like.
 */
export interface TransportCodec<TMessage, TWireFormat> {
  readonly messageSchema: Schema.Schema<TMessage, any, any>;
  readonly encode: (
    message: TMessage
  ) => Effect.Effect<TWireFormat, ParseResult.ParseError | Error, any>;
  readonly decode: (
    wire: TWireFormat
  ) => Effect.Effect<TMessage, ParseResult.ParseError | Error, any>;
}

/**
 * Configuration for schema-based transports.
 * Combines connection details with encoding specification.
 */
export interface SchemaTransportConfig<TMessage, TWireFormat> {
  readonly url: string;
  readonly retryAttempts: number;
  readonly timeout: Duration.Duration;
  readonly codec: TransportCodec<TMessage, TWireFormat>;
}

/**
 * Raw transport interface that handles wire-level communication.
 * Implementers only deal with their specific wire format (string, binary, etc).
 * Schema encoding/decoding is handled at this layer.
 */
export interface RawTransport<TWireFormat, R = never> {
  readonly connect: () => Effect.Effect<void, TransportConnectionError, R>;

  readonly publishRaw: (
    streamId: string,
    wireData: TWireFormat,
    metadata?: Record<string, unknown>
  ) => Effect.Effect<void, TransportPublishError, R>;

  readonly subscribeRaw: (
    streamId: string,
    options?: SubscriptionOptions
  ) => Stream.Stream<
    {
      readonly streamId: string;
      readonly wireData: TWireFormat;
      readonly position?: number;
      readonly timestamp: Date;
      readonly metadata?: Record<string, unknown>;
    },
    TransportSubscriptionError,
    R
  >;

  readonly subscribeMultipleRaw: (
    streamIds: readonly string[],
    options?: SubscriptionOptions
  ) => Stream.Stream<
    {
      readonly streamId: string;
      readonly wireData: TWireFormat;
      readonly position?: number;
      readonly timestamp: Date;
      readonly metadata?: Record<string, unknown>;
    },
    TransportSubscriptionError,
    R
  >;

  readonly health: Effect.Effect<TransportHealth, TransportConnectionError, R>;
  readonly metrics: Effect.Effect<TransportMetrics, TransportConnectionError, R>;
  readonly close: () => Effect.Effect<void, TransportConnectionError, R>;
}

/**
 * Schema-aware transport that provides type-safe message handling.
 * Built on top of a raw transport with automatic encoding/decoding.
 */
export interface SchemaTransport<TMessage, TStreamId = string, R = never> {
  readonly connect: () => Effect.Effect<void, TransportConnectionError, R>;

  readonly publish: (
    streamId: TStreamId,
    message: TMessage,
    metadata?: Record<string, unknown>
  ) => Effect.Effect<void, TransportPublishError | ParseResult.ParseError | Error, R | any>;

  readonly subscribe: (
    streamId: TStreamId,
    options?: SubscriptionOptions
  ) => Stream.Stream<
    ProtocolMessage<TMessage, TStreamId>,
    TransportSubscriptionError | ParseResult.ParseError | Error,
    R | any
  >;

  readonly subscribeMultiple: (
    streamIds: readonly TStreamId[],
    options?: SubscriptionOptions
  ) => Stream.Stream<
    ProtocolMessage<TMessage, TStreamId>,
    TransportSubscriptionError | ParseResult.ParseError | Error,
    R | any
  >;

  readonly health: Effect.Effect<TransportHealth, TransportConnectionError, R>;
  readonly metrics: Effect.Effect<TransportMetrics, TransportConnectionError, R>;
  readonly close: () => Effect.Effect<void, TransportConnectionError, R>;
}

/**
 * Creates a schema-aware transport from a raw transport implementation.
 * Handles all encoding/decoding automatically using the provided codec.
 */
export const makeSchemaTransport = <TMessage, TWireFormat, TStreamId = string, R = never>(
  rawTransport: RawTransport<TWireFormat, R>,
  codec: TransportCodec<TMessage, TWireFormat>
): SchemaTransport<TMessage, TStreamId, R> => ({
  connect: rawTransport.connect,
  health: rawTransport.health,
  metrics: rawTransport.metrics,
  close: rawTransport.close,

  publish: (streamId, message, metadata) =>
    pipe(
      codec.encode(message),
      Effect.flatMap((wireData) => rawTransport.publishRaw(String(streamId), wireData, metadata))
    ),

  subscribe: (streamId, options) =>
    pipe(
      rawTransport.subscribeRaw(String(streamId), options),
      Stream.mapEffect((rawMessage) =>
        pipe(
          codec.decode(rawMessage.wireData),
          Effect.map((payload) => ({
            streamId: streamId,
            payload,
            position: rawMessage.position,
            timestamp: rawMessage.timestamp,
            metadata: rawMessage.metadata,
          }))
        )
      )
    ),

  subscribeMultiple: (streamIds, options) =>
    pipe(
      rawTransport.subscribeMultipleRaw(streamIds.map(String), options),
      Stream.mapEffect((rawMessage) =>
        pipe(
          codec.decode(rawMessage.wireData),
          Effect.map((payload) => ({
            streamId: streamIds.find((id) => String(id) === rawMessage.streamId)!,
            payload,
            position: rawMessage.position,
            timestamp: rawMessage.timestamp,
            metadata: rawMessage.metadata,
          }))
        )
      )
    ),
});

/**
 * Common codec implementations for different wire formats
 */
export namespace Codecs {
  /**
   * JSON codec for string-based transports (WebSocket, HTTP, SSE)
   */
  export const json = <T>(schema: Schema.Schema<T, any, any>): TransportCodec<T, string> => ({
    messageSchema: schema,
    encode: (message) => pipe(Schema.encode(schema)(message), Effect.map(JSON.stringify)),
    decode: (wireData) =>
      pipe(
        Effect.try({
          try: () => JSON.parse(wireData),
          catch: (error) => new Error(`JSON parse error: ${error}`),
        }),
        Effect.flatMap(Schema.decode(schema))
      ),
  });

  /**
   * Identity codec for in-memory transports
   */
  export const identity = <T>(schema: Schema.Schema<T, any, any>): TransportCodec<T, T> => ({
    messageSchema: schema,
    encode: (message) =>
      pipe(
        Schema.encode(schema)(message),
        Effect.map((encoded) => encoded as T)
      ),
    decode: Schema.decode(schema),
  });

  /**
   * Binary codec for protobuf/msgpack transports
   */
  export const binary = <T>(
    schema: Schema.Schema<T, any, any>,
    binaryEncode: (data: unknown) => Uint8Array,
    binaryDecode: (data: Uint8Array) => unknown
  ): TransportCodec<T, Uint8Array> => ({
    messageSchema: schema,
    encode: (message) => pipe(Schema.encode(schema)(message), Effect.map(binaryEncode)),
    decode: (wireData) =>
      pipe(
        Effect.try({
          try: () => binaryDecode(wireData),
          catch: (error) => new Error(`Binary decode error: ${error}`),
        }),
        Effect.flatMap(Schema.decode(schema))
      ),
  });
}
