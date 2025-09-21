import { Effect, Stream, Duration, Schema, pipe, ParseResult, Scope } from 'effect';
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
 * Raw wire message format for transport layer
 */
export interface RawWireMessage<TWireFormat> {
  readonly streamId: string;
  readonly wireData: TWireFormat;
  readonly position?: number;
  readonly timestamp: Date;
  readonly metadata?: Record<string, unknown>;
}

/**
 * Connected raw transport interface - only available after successful connection.
 * Handles wire-level communication in a specific format (string, binary, etc).
 */
export interface ConnectedRawTransport<TWireFormat, R = never> {
  readonly publishRaw: (
    streamId: string,
    wireData: TWireFormat,
    metadata?: Record<string, unknown>
  ) => Effect.Effect<void, TransportPublishError, R>;

  readonly subscribeRaw: (
    streamId: string,
    options?: SubscriptionOptions
  ) => Stream.Stream<RawWireMessage<TWireFormat>, TransportSubscriptionError, R>;

  readonly subscribeMultipleRaw: (
    streamIds: readonly string[],
    options?: SubscriptionOptions
  ) => Stream.Stream<RawWireMessage<TWireFormat>, TransportSubscriptionError, R>;

  readonly health: Effect.Effect<TransportHealth, TransportConnectionError, R>;
  readonly metrics: Effect.Effect<TransportMetrics, TransportConnectionError, R>;
}

/**
 * Creates a connected raw transport within a scope.
 * The connection is established during acquire and cleaned up during release.
 * Implementations are free to curry their own config parameters before
 * returning this function signature.
 */
export type CreateRawTransport<TWireFormat, R = never> = () => Effect.Effect<
  ConnectedRawTransport<TWireFormat, R>,
  TransportConnectionError,
  R | Scope.Scope
>;

/**
 * Connected schema-aware transport - only available after successful connection.
 * Provides type-safe message handling with automatic encoding/decoding.
 */
export interface ConnectedSchemaTransport<TMessage, TStreamId = string, R = never> {
  readonly publish: (
    streamId: TStreamId,
    message: TMessage,
    metadata?: Record<string, unknown>
  ) => Effect.Effect<void, TransportPublishError | ParseResult.ParseError | Error, R>;

  readonly subscribe: (
    streamId: TStreamId,
    options?: SubscriptionOptions
  ) => Stream.Stream<
    ProtocolMessage<TMessage, TStreamId>,
    TransportSubscriptionError | ParseResult.ParseError | Error,
    R
  >;

  readonly subscribeMultiple: (
    streamIds: readonly TStreamId[],
    options?: SubscriptionOptions
  ) => Stream.Stream<
    ProtocolMessage<TMessage, TStreamId>,
    TransportSubscriptionError | ParseResult.ParseError | Error,
    R
  >;

  readonly health: Effect.Effect<TransportHealth, TransportConnectionError, R>;
  readonly metrics: Effect.Effect<TransportMetrics, TransportConnectionError, R>;
}

/**
 * Creates a connected schema transport within a scope.
 * Built on top of a raw transport with automatic encoding/decoding.
 * The connection is established during acquire and cleaned up during release.
 * Implementations are free to curry their own config parameters before
 * returning this function signature.
 */
export type CreateSchemaTransport<
  TMessage,
  _TWireFormat,
  TStreamId = string,
  R = never,
> = () => Effect.Effect<
  ConnectedSchemaTransport<TMessage, TStreamId, R>,
  TransportConnectionError,
  R | Scope.Scope
>;

/**
 * Creates a schema-aware transport from a raw transport implementation.
 * Handles all encoding/decoding automatically using the provided codec.
 * Both the raw transport and codec are curried before returning the transport creator.
 */
export const makeSchemaTransport =
  <TMessage, TWireFormat, TStreamId = string, R = never>(
    createRawTransport: CreateRawTransport<TWireFormat, R>,
    codec: TransportCodec<TMessage, TWireFormat>
  ): CreateSchemaTransport<TMessage, TWireFormat, TStreamId, R> =>
  () =>
    pipe(
      createRawTransport(),
      Effect.map((connectedRaw) => ({
        publish: (streamId, message, metadata) =>
          pipe(
            codec.encode(message),
            Effect.flatMap((wireData) =>
              connectedRaw.publishRaw(String(streamId), wireData, metadata)
            )
          ),

        subscribe: (streamId, options) =>
          pipe(
            connectedRaw.subscribeRaw(String(streamId), options),
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
            connectedRaw.subscribeMultipleRaw(streamIds.map(String), options),
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

        health: connectedRaw.health,
        metrics: connectedRaw.metrics,
      }))
    );

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
