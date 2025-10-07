import { Effect, Console } from 'effect';

const transform = (x: number) => x * 2;
const doSomething = (a: string, b: number) => `${a}: ${b}`;

// Arrow function - single parameter
// eslint-disable-next-line effect/no-eta-expansion -- Testing eta-expansion with single parameter
const singleParamWrapper = (x: number) => transform(x);

// Arrow function - multiple parameters
// eslint-disable-next-line effect/no-eta-expansion -- Testing eta-expansion with multiple parameters
const multiParamWrapper = (a: string, b: number) => doSomething(a, b);

// Arrow function - method call
// eslint-disable-next-line effect/no-eta-expansion -- Testing eta-expansion with method call
const methodWrapper = (msg: string) => Console.log(msg);

// Arrow function - Effect method
// eslint-disable-next-line effect/no-eta-expansion -- Testing eta-expansion with Effect.succeed
const effectWrapper = (value: number) => Effect.succeed(value);

// Function declaration - single parameter
// eslint-disable-next-line effect/no-eta-expansion -- Testing eta-expansion in function declaration
function functionDeclWrapper(x: number) {
  return transform(x);
}

// Function declaration - multiple parameters
// eslint-disable-next-line effect/no-eta-expansion -- Testing eta-expansion in function declaration with multiple params
function functionDeclMultiParam(a: string, b: number) {
  return doSomething(a, b);
}

// Function expression - single parameter
// eslint-disable-next-line effect/no-eta-expansion -- Testing eta-expansion in function expression
const functionExprWrapper = function (x: number) {
  return transform(x);
};

// Function expression - multiple parameters
// eslint-disable-next-line effect/no-eta-expansion -- Testing eta-expansion in function expression with multiple params
const functionExprMultiParam = function (a: string, b: number) {
  return doSomething(a, b);
};

// Valid cases that should NOT trigger the rule:

// Different parameter names
const validDifferentNames = (x: number) => transform(x + 1);

// Different parameter order
const validDifferentOrder = (a: string, b: number) => doSomething(b.toString(), Number(a));

// Additional operations
const validAdditionalOps = (x: number) => {
  const doubled = transform(x);
  return doubled;
};

// Different number of parameters
const validDifferentCount = (x: number) => doSomething('prefix', x);

// Not a call expression
const validNotACall = (x: number) => x;

// Curried function (intentional wrapper)
const validCurried = (prefix: string) => (x: number) => doSomething(prefix, x);
