/**
 * WebSocket Server Transport Implementation (TDD Placeholder)
 *
 * This is a placeholder implementation created as part of outside-in TDD.
 * The integration tests are written first, and this file will be properly
 * implemented to make those tests pass.
 *
 * Current status: PLACEHOLDER - All methods throw "Not implemented" errors.
 */

import { Effect } from 'effect';
import { Server } from '@codeforbreakfast/eventsourcing-transport-contracts';

/**
 * WebSocket Server Acceptor - NOT IMPLEMENTED YET
 *
 * This is just a placeholder to allow the tests to import this module.
 * All methods will throw "Not implemented" errors until we implement them
 * as part of the TDD cycle.
 */
export const WebSocketAcceptor = {
  make: (_config: unknown): Effect.Effect<Server.AcceptorInterface, never, never> =>
    Effect.succeed({
      start: () =>
        Effect.fail(
          new Server.ServerStartError({
            message: 'WebSocket server not implemented yet - this is expected in TDD!',
          })
        ),
    }),
};
