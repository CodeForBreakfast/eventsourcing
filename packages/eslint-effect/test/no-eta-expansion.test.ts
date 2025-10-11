import { Effect, Console } from 'effect';

const transform = (x: number) => x * 2;
const doSomething = (a: string, b: number) => `${a}: ${b}`;

// Arrow function - single parameter

const singleParamWrapper = (x: number) => transform(x);

// Arrow function - multiple parameters

const multiParamWrapper = (a: string, b: number) => doSomething(a, b);

// Arrow function - method call

const methodWrapper = (msg: string) => Console.log(msg);

// Arrow function - Effect method

const effectWrapper = (value: number) => Effect.succeed(value);

// Function declaration - single parameter

function functionDeclWrapper(x: number) {
  return transform(x);
}

// Function declaration - multiple parameters

function functionDeclMultiParam(a: string, b: number) {
  return doSomething(a, b);
}

// Function expression - single parameter

const functionExprWrapper = function (x: number) {
  return transform(x);
};

// Function expression - multiple parameters

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
