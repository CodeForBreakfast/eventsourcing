# E2E Testing with Playwright

This document describes the end-to-end testing setup for the Todo App example.

## Overview

The E2E tests use Playwright to verify the complete application flow, including:

- WebSocket connection establishment
- Command/event communication between frontend and backend
- User interactions (adding, completing, deleting todos)
- Real-time UI updates driven by events
- Edge cases and error handling

## Test Structure

```
e2e/
├── setup.ts                  # Pre-test cleanup of data directories
├── todo-app.spec.ts          # Main user flow tests
└── websocket-events.spec.ts  # WebSocket-specific and edge case tests
```

## Running Tests

### Prerequisites

First, ensure Playwright browsers are installed:

```bash
bunx playwright install chromium
```

### Run Tests via Turbo

Always use Turbo to run tests to benefit from caching:

```bash
# Run all E2E tests
turbo test:e2e --filter=@codeforbreakfast/eventsourcing-example-todo

# Run with UI mode for debugging
turbo test:e2e:ui --filter=@codeforbreakfast/eventsourcing-example-todo

# Run with browser visible (headed mode)
turbo test:e2e:headed --filter=@codeforbreakfast/eventsourcing-example-todo
```

### Direct npm scripts (when not using Turbo)

```bash
# Run all tests
bun run test:e2e

# Run with UI mode
bun run test:e2e:ui

# Run with browser visible
bun run test:e2e:headed
```

## How It Works

### Server Auto-Start

Playwright automatically starts the server before running tests using the `webServer` configuration in `playwright.config.ts`. The server runs on:

- HTTP: `http://localhost:3000` (serves static files)
- WebSocket: `ws://localhost:8080` (handles commands/events)

The tests wait for the server to be ready before proceeding.

### Test Data Cleanup

A setup project runs before all tests to clean up any leftover data directories:

- `./todo-data/` - Production event store data
- `./test-todo-data/` - Test event store data

This ensures each test run starts with a clean slate.

### Test Categories

#### 1. Connection Tests

Verify WebSocket connection and initial state:

- Connection status indicators
- Input/button disabled state until connected
- Successful connection establishment

#### 2. CRUD Operations

Test basic todo operations:

- Adding todos (via button and Enter key)
- Completing/uncompleting todos
- Deleting todos
- Multiple todos with different states

#### 3. Event Flow Tests

Verify event-driven behavior:

- Real-time UI updates from WebSocket events
- Command execution and response cycles
- Data consistency across operations
- Todo ID generation and display

#### 4. Edge Cases

Test boundary conditions:

- Empty/whitespace-only todos
- Special characters in titles
- Very long titles
- Rapid successive operations

## Test Implementation Notes

### Timeouts

Tests include small timeouts (50-200ms) after operations to allow WebSocket events to propagate and the UI to update. This is necessary because:

1. Commands are sent to the backend
2. Backend processes and emits events
3. Frontend receives events and updates state
4. React/DOM updates are rendered

### DOM Structure

Tests rely on these element selectors:

- `#newTodoInput` - Text input field
- `#addTodoBtn` - Add button
- `#todoList` - Todo list container
- `#status` - Connection status indicator
- `.todo-item` - Individual todo items
- `.todo-checkbox` - Complete/uncomplete checkboxes
- `.todo-delete` - Delete buttons
- `.todo-text` - Todo title text
- `.todo-id` - Todo identifier
- `.empty-state` - Empty list message

### Parallelization

Tests run in parallel by default (`fullyParallel: true`) for speed. In CI, tests run sequentially (`workers: 1`) for stability.

## Debugging

### UI Mode

The best way to debug tests is using Playwright's UI mode:

```bash
turbo test:e2e:ui --filter=@codeforbreakfast/eventsourcing-example-todo
```

This provides:

- Visual test execution
- Time travel debugging
- DOM inspector
- Network activity viewer

### Headed Mode

To see the browser during test execution:

```bash
turbo test:e2e:headed --filter=@codeforbreakfast/eventsourcing-example-todo
```

### Traces

Playwright captures traces on first retry. View them in the HTML report:

```bash
bunx playwright show-report
```

## CI Integration

The configuration is CI-ready:

- `forbidOnly: true` prevents `.only()` from being committed
- `retries: 2` in CI for flakiness resilience
- `workers: 1` in CI for predictable execution
- Server reuse disabled in CI for clean state

## Coverage

Current test coverage includes:

- ✅ WebSocket connection lifecycle
- ✅ All CRUD operations (Create, Complete, Uncomplete, Delete)
- ✅ Multiple todos and state management
- ✅ Real-time event propagation
- ✅ Edge cases (empty input, special characters, long titles)
- ✅ Keyboard shortcuts (Enter to add)
- ✅ Input validation and clearing

## Known Limitations

1. **Test data persistence**: Event store data is file-based. Tests clean up before running but may leave data if interrupted.

2. **Port conflicts**: Tests assume ports 3000 and 8080 are available. If not, you'll need to stop conflicting services.

3. **WebSocket timing**: Some tests use fixed timeouts. Very slow systems might need longer waits.

4. **Browser installation**: Chromium must be installed separately with `bunx playwright install chromium`.

## Future Improvements

Potential enhancements:

- Add visual regression tests for UI consistency
- Test WebSocket reconnection on network failures
- Test concurrent users with multiple browser contexts
- Add performance/load testing
- Test keyboard accessibility
