import { test } from 'bun:test';
import * as Either from 'effect/Either';
import * as Exit from 'effect/Exit';
import * as Option from 'effect/Option';
import {
  assertEquals,
  assertLeft,
  assertNone,
  assertRight,
  assertSome,
  assertSuccess,
} from '../src/utils.js';

test('assertEquals', () => {
  assertEquals(1, 1);
});

test('assertSome', () => {
  assertSome(Option.some(1), 1);
});

test('assertNone', () => {
  assertNone(Option.none());
});

test('assertLeft', () => {
  assertLeft(Either.left('error'), 'error');
});

test('assertRight', () => {
  assertRight(Either.right(42), 42);
});

test('assertSuccess', () => {
  assertSuccess(Exit.succeed(42), 42);
});
