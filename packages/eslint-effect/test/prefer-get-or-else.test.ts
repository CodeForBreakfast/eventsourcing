import { Option, pipe } from 'effect';

declare const maybeValue: Option.Option<string>;
declare const maybeNumber: Option.Option<number>;
declare const maybeObj: Option.Option<{ name: string }>;
declare const nested: { option: Option.Option<string> };
declare const isSome: (opt: unknown) => boolean;

// Valid cases - should not trigger the rule

const validUsage1 = pipe(
  maybeValue,
  Option.getOrElse(() => 'default')
);

const validUsage2 = pipe(
  maybeNumber,
  Option.getOrElse(() => 0)
);

const validDifferentCondition = maybeValue ? 'yes' : 'no';

const validNotIsSomeCall = isSome(maybeValue) ? 'some value' : 'default';

const validNoValueAccess = Option.isSome(maybeValue) ? maybeValue : Option.none();

const validComplexConsequent = Option.isSome(maybeValue)
  ? maybeValue.value.toUpperCase()
  : 'default';

const validDifferentOptionInConsequent = Option.isSome(maybeValue) ? 'different' : 'default';

// Invalid cases - should trigger the rule

// eslint-disable-next-line effect/prefer-get-or-else
const invalidBasic = Option.isSome(maybeValue) ? maybeValue.value : 'default';

// eslint-disable-next-line effect/prefer-get-or-else
const invalidWithNumber = Option.isSome(maybeNumber) ? maybeNumber.value : 0;

// eslint-disable-next-line effect/prefer-get-or-else
const invalidWithNull = Option.isSome(maybeValue) ? maybeValue.value : null;

// eslint-disable-next-line effect/prefer-get-or-else
const invalidWithUndefined = Option.isSome(maybeValue) ? maybeValue.value : undefined;

// eslint-disable-next-line effect/prefer-get-or-else
const invalidWithObject = Option.isSome(maybeObj) ? maybeObj.value : { name: 'default' };

// eslint-disable-next-line effect/prefer-get-or-else
const invalidNested = Option.isSome(nested.option) ? nested.option.value : 'default';

const invalidInFunction = (opt: Option.Option<string>) =>
  // eslint-disable-next-line effect/prefer-get-or-else
  Option.isSome(opt) ? opt.value : 'default';

const invalidInlinedInExpression = [maybeValue].map((opt) =>
  // eslint-disable-next-line effect/prefer-get-or-else
  Option.isSome(opt) ? opt.value : 'fallback'
);

// eslint-disable-next-line effect/prefer-get-or-else
const invalidWithComplexDefault = Option.isSome(maybeValue) ? maybeValue.value : computeDefault();

declare function computeDefault(): string;
