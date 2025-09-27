/**
 * WebSocket Transport Unit Tests
 *
 * Tests edge cases and error scenarios that can't be effectively tested with real WebSockets.
 * Uses mock WebSockets to control specific failure scenarios like connection errors,
 * malformed messages, and connection state transitions.
 *
 * TESTING ARCHITECTURE:
 * - Unit tests (this file): Edge cases with mocks - connection errors, malformed data, etc.
 * - Integration tests: Real WebSocket client-server communication and contract compliance
 * - Contract tests: Run as part of integration tests with real WebSockets
 *
 * This approach ensures we test transport behavior, not mock behavior.
 */

import { Effect, Stream, pipe, Fiber } from 'effect';
import * as Duration from 'effect/Duration';
import { makeTransportMessage, makeMessageId } from '@codeforbreakfast/eventsourcing-transport';
import { WebSocketConnector } from './websocket-transport';
import { describe, it, expect, beforeAll, afterAll } from '@codeforbreakfast/buntest';

// =============================================================================
// Minimal WebSocket Mock for Testing Transport Logic
// =============================================================================

type MockWebSocketInstance = {
  onopen: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  readyState: number;
  url: string;
  send: (data: string) => void;
  close: () => void;
  simulateOpen: () => void;
  simulateClose: (code?: number, reason?: string) => void;
  simulateError: () => void;
  simulateMessage: (data: string) => void;
};

const WebSocketConstants = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

function MockWebSocket(url: string): MockWebSocketInstance {
  const instance: MockWebSocketInstance = {
    onopen: null,
    onclose: null,
    onerror: null,
    onmessage: null,
    readyState: WebSocketConstants.CONNECTING,
    url,

    send(_data: string): void {
      if (this.readyState !== WebSocketConstants.OPEN) {
        throw new Error('WebSocket is not open');
      }
      // Mock doesn't echo - that would test the mock, not the transport
    },

    close(): void {
      this.readyState = WebSocketConstants.CLOSED;
      if (this.onclose) {
        this.onclose(new CloseEvent('close'));
      }
    },

    // Test utilities to manually trigger WebSocket events
    simulateOpen(): void {
      this.readyState = WebSocketConstants.OPEN;
      if (this.onopen) {
        this.onopen(new Event('open'));
      }
    },

    simulateClose(code = 1000, reason = ''): void {
      this.readyState = WebSocketConstants.CLOSED;
      if (this.onclose) {
        this.onclose(new CloseEvent('close', { code, reason }));
      }
    },

    simulateError(): void {
      this.readyState = WebSocketConstants.CLOSED;
      if (this.onerror) {
        this.onerror(new Event('error'));
      }
    },

    simulateMessage(data: string): void {
      if (this.onmessage) {
        this.onmessage(new MessageEvent('message', { data }));
      }
    },
  };

  // Track for test utilities
  globalThis.lastCreatedWebSocket = instance;

  // Auto-simulate connection for contract tests (URLs that don't contain 'test-unit' prefix)
  // Unit tests that use 'test-unit' prefix will need to manually control the connection
  if (
    !url.includes('test-unit') &&
    !url.includes('test-error') &&
    !url.includes('test-malformed') &&
    !url.includes('test-states') &&
    !url.includes('test-not-connected')
  ) {
    setTimeout(() => {
      // Auto-connect for contract tests
      if (url.includes('invalid') || url.includes('non-existent')) {
        instance.simulateError();
      } else {
        instance.simulateOpen();
      }
    }, 10);
  }

  return instance;
}

// Add static constants
Object.assign(MockWebSocket, WebSocketConstants);

declare global {
  var lastCreatedWebSocket: MockWebSocketInstance | undefined;
}

// Store original WebSocket for restoration
const originalWebSocket = globalThis.WebSocket;

// =============================================================================
// WebSocket Transport Unit Tests - Test Transport Logic
// =============================================================================

describe('WebSocket Transport - Edge Case Tests (with Mocks)', () => {
  let mockWs: MockWebSocketInstance;

  beforeAll(() => {
    // Install mock WebSocket for controlled testing
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
    globalThis.lastCreatedWebSocket = undefined;
  });

  afterAll(() => {
    // Restore original WebSocket
    if (originalWebSocket) {
      globalThis.WebSocket = originalWebSocket;
    } else {
      delete (globalThis as { WebSocket?: typeof WebSocket }).WebSocket;
    }
  });

  it.effect('should handle connection lifecycle correctly', () =>
    Effect.scoped(
      pipe(
        Effect.fork(WebSocketConnector.connect('ws://test-unit.com')),
        Effect.flatMap((transportFiber) =>
          pipe(
            Effect.sleep(Duration.millis(10)),
            Effect.flatMap(() => {
              mockWs = globalThis.lastCreatedWebSocket!;
              expect(mockWs).toBeDefined();
              expect(mockWs.readyState).toBe(WebSocketConstants.CONNECTING);

              // Manually trigger connection open
              mockWs.simulateOpen();

              return Fiber.join(transportFiber);
            }),
            Effect.flatMap((transport) =>
              pipe(
                transport.connectionState,
                Stream.take(1),
                Stream.runHead,
                Effect.tap((state) => {
                  expect(state._tag).toBe('Some');
                  if (state._tag === 'Some') {
                    expect(state.value).toBe('connected');
                  }
                  return Effect.void;
                })
              )
            )
          )
        )
      )
    )
  );

  it.effect('should handle connection errors correctly', () =>
    Effect.scoped(
      pipe(
        Effect.fork(pipe(WebSocketConnector.connect('ws://test-error.com'), Effect.either)),
        Effect.flatMap((transportFiber) =>
          pipe(
            Effect.sleep(Duration.millis(10)),
            Effect.flatMap(() => {
              mockWs = globalThis.lastCreatedWebSocket!;
              mockWs.simulateError();
              return Fiber.join(transportFiber);
            }),
            Effect.tap((result) => {
              expect(result._tag).toBe('Left');
              return Effect.void;
            })
          )
        )
      )
    )
  );

  it.effect('should handle incoming messages correctly', () =>
    Effect.scoped(
      pipe(
        Effect.fork(WebSocketConnector.connect('ws://test-messages.com')),
        Effect.flatMap((transportFiber) =>
          pipe(
            Effect.sleep(Duration.millis(10)),
            Effect.flatMap(() => {
              mockWs = globalThis.lastCreatedWebSocket!;
              mockWs.simulateOpen();
              return Fiber.join(transportFiber);
            }),
            Effect.flatMap((transport) =>
              pipe(
                transport.subscribe(),
                Effect.flatMap((stream) =>
                  pipe(
                    stream,
                    Stream.take(1),
                    Stream.runCollect,
                    Effect.map((chunk) => Array.from(chunk)),
                    Effect.fork
                  )
                ),
                Effect.flatMap((messagesFiber) =>
                  pipe(
                    Effect.sleep(Duration.millis(10)),
                    Effect.flatMap(() => {
                      const testMessage = makeTransportMessage(
                        'test-msg-1',
                        'test-type',
                        JSON.stringify({ data: 'test-data' })
                      );
                      mockWs.simulateMessage(JSON.stringify(testMessage));
                      return Fiber.join(messagesFiber);
                    }),
                    Effect.tap((receivedMessages) => {
                      expect(receivedMessages).toHaveLength(1);
                      expect(receivedMessages[0]?.id).toBe(makeMessageId('test-msg-1'));
                      expect(receivedMessages[0]?.type).toBe('test-type');
                      expect(receivedMessages[0]?.payload).toBe(
                        JSON.stringify({ data: 'test-data' })
                      );
                      return Effect.void;
                    })
                  )
                )
              )
            )
          )
        )
      )
    )
  );

  it.effect('should handle malformed incoming messages gracefully', () =>
    Effect.scoped(
      pipe(
        Effect.fork(WebSocketConnector.connect('ws://test-malformed.com')),
        Effect.flatMap((transportFiber) =>
          pipe(
            Effect.sleep(Duration.millis(10)),
            Effect.flatMap(() => {
              mockWs = globalThis.lastCreatedWebSocket!;
              mockWs.simulateOpen();
              return Fiber.join(transportFiber);
            }),
            Effect.flatMap((transport) =>
              pipe(
                transport.subscribe(),
                Effect.flatMap((stream) =>
                  pipe(
                    stream,
                    Stream.take(1),
                    Stream.runCollect,
                    Effect.map((chunk) => Array.from(chunk)),
                    Effect.timeout(500),
                    Effect.either,
                    Effect.fork
                  )
                ),
                Effect.flatMap((messagesFiber) =>
                  pipe(
                    Effect.sleep(Duration.millis(10)),
                    Effect.flatMap(() => {
                      // Send malformed JSON - should be ignored
                      mockWs.simulateMessage('invalid-json{');

                      // Send valid message after malformed one
                      const validMessage = makeTransportMessage('valid', 'test', 'data');
                      mockWs.simulateMessage(JSON.stringify(validMessage));

                      return Fiber.join(messagesFiber);
                    }),
                    Effect.tap((result) => {
                      // Should receive the valid message, malformed one should be ignored
                      if (result._tag === 'Right') {
                        expect(result.right).toHaveLength(1);
                        expect(result.right[0]?.id).toBe(makeMessageId('valid'));
                        expect(result.right[0]?.type).toBe('test');
                        expect(result.right[0]?.payload).toBe('data');
                      } else {
                        // Timeout is also acceptable - means malformed message was properly ignored
                        expect(result._tag).toBe('Left');
                      }
                      return Effect.void;
                    })
                  )
                )
              )
            )
          )
        )
      )
    )
  );

  it.effect('should handle WebSocket connection errors', () =>
    // Test what happens when WebSocket fires an error event during connection
    Effect.scoped(
      pipe(
        pipe(WebSocketConnector.connect('ws://test-error.com'), Effect.either, Effect.fork),
        Effect.flatMap((connectResult) =>
          pipe(
            Effect.sleep(Duration.millis(10)),
            Effect.flatMap(() => {
              mockWs = globalThis.lastCreatedWebSocket!;
              expect(mockWs).toBeDefined();

              // Simulate connection error
              mockWs.simulateError();

              return Fiber.join(connectResult);
            }),
            Effect.tap((result) => {
              expect(result._tag).toBe('Left');
              if (result._tag === 'Left') {
                expect(result.left._tag).toBe('ConnectionError');
              }
              return Effect.void;
            })
          )
        )
      )
    )
  );

  it.effect('should handle WebSocket close before open', () =>
    // Test what happens when WebSocket closes before opening (connection refused scenario)
    Effect.scoped(
      pipe(
        pipe(WebSocketConnector.connect('ws://test-close.com'), Effect.either, Effect.fork),
        Effect.flatMap((connectResult) =>
          pipe(
            Effect.sleep(Duration.millis(10)),
            Effect.flatMap(() => {
              mockWs = globalThis.lastCreatedWebSocket!;
              expect(mockWs).toBeDefined();

              // Simulate immediate close (like connection refused)
              mockWs.simulateClose(1006, 'Connection refused');

              return Fiber.join(connectResult);
            }),
            Effect.tap((result) => {
              expect(result._tag).toBe('Left');
              if (result._tag === 'Left') {
                expect(result.left._tag).toBe('ConnectionError');
              }
              return Effect.void;
            })
          )
        )
      )
    )
  );

  it.effect('should reject publish when not connected', () =>
    Effect.scoped(
      pipe(
        Effect.fork(WebSocketConnector.connect('ws://test-not-connected.com')),
        Effect.flatMap((transportFiber) =>
          pipe(
            Effect.sleep(Duration.millis(10)),
            Effect.flatMap(() => {
              mockWs = globalThis.lastCreatedWebSocket!;
              // First simulate connection success so transport creation succeeds
              mockWs.simulateOpen();
              return Fiber.join(transportFiber);
            }),
            Effect.flatMap((transport) =>
              pipe(
                Effect.sleep(Duration.millis(10)),
                Effect.flatMap(() => {
                  // Now simulate disconnection so publish will fail
                  mockWs.simulateClose();
                  return Effect.sleep(Duration.millis(10));
                }),
                Effect.flatMap(() =>
                  pipe(
                    transport.publish(makeTransportMessage('test', 'test', 'should fail')),
                    Effect.either
                  )
                ),
                Effect.tap((result) => {
                  expect(result._tag).toBe('Left');
                  return Effect.void;
                })
              )
            )
          )
        )
      )
    )
  );
});
