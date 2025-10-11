import { pipe, Match } from 'effect';

type MyResult =
  | { readonly _tag: 'Success'; readonly value: number }
  | { readonly _tag: 'Failure'; readonly error: string };

const matchWithTagTest = (result: MyResult) =>
  pipe(
    result,
    Match.value,

    Match.when({ _tag: 'Success' }, (res) => res.value),

    Match.when({ _tag: 'Failure' }, (res) => 0),
    Match.exhaustive
  );
