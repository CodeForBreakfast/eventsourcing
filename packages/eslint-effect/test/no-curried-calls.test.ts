import { Schema } from 'effect';

const MySchema = Schema.Struct({ value: Schema.Number });

// eslint-disable-next-line effect/no-curried-calls
const curriedCall = Schema.decodeUnknown(MySchema)({ value: 42 });
