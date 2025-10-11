import { Schema } from 'effect';

const MySchema = Schema.Struct({ value: Schema.Number });

const curriedCall = Schema.decodeUnknown(MySchema)({ value: 42 });
