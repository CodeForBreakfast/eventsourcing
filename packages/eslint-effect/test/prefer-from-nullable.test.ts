import { Option } from 'effect';

declare const someValue: string | null | undefined;
declare const differentValue: string;
declare const obj: { property: string | null };
declare const x: { y: { z: string | null } };
declare const someArray: ReadonlyArray<string | null>;
declare const some: (value: unknown) => unknown;
declare const none: () => unknown;
declare const value: unknown;

// Valid cases - should not trigger the rule

const validUsage1 = Option.fromNullable(someValue);

const validUsage2 = Option.fromNullable(null);

const validUsage3 = Option.fromNullable(undefined);

const validDifferentCondition = someValue === 'test' ? Option.some(someValue) : Option.none();

const validDifferentConsequent = someValue != null ? Option.some(differentValue) : Option.none();

const validDifferentAlternate = someValue != null ? Option.some(someValue) : Option.some('default');

const validNotOptionCall = someValue != null ? some(someValue) : none();

const validMissingImport = value != null ? Option.some(value) : undefined;

// Invalid cases - should trigger the rule

// eslint-disable-next-line effect/prefer-from-nullable
const invalidNotEqual = someValue != null ? Option.some(someValue) : Option.none();

// eslint-disable-next-line effect/prefer-from-nullable
const invalidNotEqualStrict = someValue !== null ? Option.some(someValue) : Option.none();

// eslint-disable-next-line effect/prefer-from-nullable
const invalidEqualNull = someValue == null ? Option.none() : Option.some(someValue);

// eslint-disable-next-line effect/prefer-from-nullable
const invalidEqualNullStrict = someValue === null ? Option.none() : Option.some(someValue);

// eslint-disable-next-line effect/prefer-from-nullable
const invalidEqualUndefined = someValue == undefined ? Option.none() : Option.some(someValue);

const invalidEqualUndefinedStrict =
  // eslint-disable-next-line effect/prefer-from-nullable
  someValue === undefined ? Option.none() : Option.some(someValue);

// eslint-disable-next-line effect/prefer-from-nullable
const invalidNotEqualUndefined = someValue != undefined ? Option.some(someValue) : Option.none();

const invalidNotEqualUndefinedStrict =
  // eslint-disable-next-line effect/prefer-from-nullable
  someValue !== undefined ? Option.some(someValue) : Option.none();

// eslint-disable-next-line effect/prefer-from-nullable
const invalidWithPropertyAccess = obj.property != null ? Option.some(obj.property) : Option.none();

// eslint-disable-next-line effect/prefer-from-nullable
const invalidNested = x.y.z != null ? Option.some(x.y.z) : Option.none();

// eslint-disable-next-line effect/prefer-from-nullable
const invalidInFunction = (value: unknown) => (value != null ? Option.some(value) : Option.none());

const invalidInlinedInExpression = someArray.map((item) =>
  // eslint-disable-next-line effect/prefer-from-nullable
  item != null ? Option.some(item) : Option.none()
);
