// Core Effect best practices - universally recommended (now as named rules)
const effectRecommendedRules = {
  'effect/no-classes': 'error',
  'effect/no-runSync': 'error',
  'effect/no-runPromise': 'error',
  'effect/prefer-andThen': 'error',
  'effect/prefer-as': 'error',
};

// Opinionated: forbid Effect.gen in favor of pipe composition
const noGenRules = {
  'effect/no-gen': 'error',
};

// Opinionated: prefer Match over direct _tag access
const preferMatchRestrictions = [
  {
    selector: 'MemberExpression[computed=false][property.type="Identifier"][property.name="_tag"]',
    message:
      "Direct _tag access is forbidden. Use Effect's type guards instead: Either.isLeft/isRight, Option.isSome/isNone, Exit.isSuccess/isFailure, or match() functions.",
  },
  {
    selector:
      'SwitchStatement > MemberExpression.discriminant[property.type="Identifier"][property.name="_tag"]',
    message:
      "switch on _tag is forbidden. Use Effect's match() functions instead: Either.match, Option.match, Exit.match, or Data.TaggedEnum.match.",
  },
];

// Basic pipe best practices - less controversial
const pipeRecommendedRestrictions = [
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.property.type="Identifier"][callee.property.name="pipe"]',
    message:
      'Method-based .pipe() is forbidden. Use the standalone pipe() function instead for consistency.',
  },
  {
    selector:
      'CallExpression[callee.type="CallExpression"][callee.callee.type="MemberExpression"][callee.callee.object.type="Identifier"][callee.callee.property.type="Identifier"]:not([callee.callee.object.name="Context"][callee.callee.property.name="Tag"]):not([callee.callee.object.name="Context"][callee.callee.property.name="GenericTag"]):not([callee.callee.object.name="Effect"][callee.callee.property.name="Tag"]):not([callee.callee.object.name="Data"][callee.callee.property.name="TaggedError"]):not([callee.callee.object.name="Schema"][callee.callee.property.name="Class"])',
    message:
      'Curried function calls are forbidden. Use pipe() instead. Example: pipe(data, Schema.decodeUnknown(schema)) instead of Schema.decodeUnknown(schema)(data)',
  },
  {
    selector:
      'CallExpression[callee.type="MemberExpression"][callee.property.type="Identifier"][callee.property.name=/^(map|flatMap|filterMap|tap|forEach)$/] > ArrowFunctionExpression[params.length=1][params.0.type="Identifier"][body.type="Identifier"]',
    message:
      'Identity function in transformation is pointless. Example: Effect.map((x) => x) does nothing. Remove it or replace with the actual transformation needed.',
  },
  {
    selector:
      'CallExpression[callee.type="Identifier"][callee.name="pipe"] > .arguments:first-child[type="CallExpression"][arguments.length=1]',
    message:
      'First argument in pipe() should not be a function call with a single argument. Instead of pipe(fn(x), ...), use pipe(x, fn, ...).',
  },
];

// Opinionated: strict pipe composition rules
const pipeStrictRestrictions = [
  {
    selector:
      'CallExpression[callee.type="Identifier"][callee.name="pipe"] CallExpression[callee.type="Identifier"][callee.name="pipe"]',
    message:
      'Nested pipe() calls are forbidden. Extract the inner pipe to a separate named function that returns an Effect.',
  },
  {
    selector:
      'ArrowFunctionExpression:has(CallExpression[callee.type="Identifier"][callee.name="pipe"]) CallExpression[callee.type="Identifier"][callee.name="pipe"] ~ CallExpression[callee.type="Identifier"][callee.name="pipe"]',
    message:
      'Multiple pipe() calls in a function are forbidden. Extract additional pipes to separate named functions.',
  },
  {
    selector:
      'FunctionDeclaration:has(CallExpression[callee.type="Identifier"][callee.name="pipe"]) CallExpression[callee.type="Identifier"][callee.name="pipe"] ~ CallExpression[callee.type="Identifier"][callee.name="pipe"]',
    message:
      'Multiple pipe() calls in a function are forbidden. Extract additional pipes to separate named functions.',
  },
  {
    selector:
      'FunctionExpression:has(CallExpression[callee.type="Identifier"][callee.name="pipe"]) CallExpression[callee.type="Identifier"][callee.name="pipe"] ~ CallExpression[callee.type="Identifier"][callee.name="pipe"]',
    message:
      'Multiple pipe() calls in a function are forbidden. Extract additional pipes to separate named functions.',
  },
];

export const functionalImmutabilityRules = {
  'functional/prefer-immutable-types': [
    'error',
    {
      enforcement: 'ReadonlyShallow',
      ignoreInferredTypes: true,
      ignoreTypePattern: [
        // Effect types are immutable-by-contract but contain internal mutable state
        '^Ref\\.Ref<.*>$',
        '^Queue\\.Queue<.*>$',
        '^HashMap\\.HashMap<.*>$',
        '^HashSet\\.HashSet<.*>$',
        '^Stream\\.Stream<.*>$',
        '^PubSub\\.PubSub<.*>$',
        // Bun types wrapped in ReadonlyDeep are treated as immutable at boundaries
        'ServerWebSocket<.*>$',
        // Built-in types wrapped in ReadonlyDeep are treated as immutable
        '^ReadonlyDeep<Date>$',
      ],
      parameters: {
        // Use ReadonlyShallow for parameters because Effect types contain internal
        // mutable state. ReadonlyShallow ensures readonly wrappers while allowing
        // Effect types within the structure.
        enforcement: 'ReadonlyShallow',
      },
    },
  ],
  'functional/type-declaration-immutability': [
    'error',
    {
      rules: [
        {
          identifiers: ['I.+'],
          immutability: 'ReadonlyDeep',
          comparator: 'AtLeast',
        },
      ],
      ignoreIdentifierPattern: [
        // Interfaces/types containing Effect/Schema types which are immutable-by-contract
        '.*Internal.*',
        '.*State',
        '.*Store',
        'Incoming.*',
      ],
    },
  ],
  'functional/no-let': 'error',
  'functional/immutable-data': [
    'error',
    {
      ignoreImmediateMutation: true,
      ignoreClasses: true,
      ignoreAccessorPattern: ['draft.**', '**.draft'],
    },
  ],
  'functional/prefer-readonly-type': 'error',
  'functional/no-method-signature': 'off',
  'functional/no-mixed-types': 'off',
  'functional/no-return-void': 'off',
  'functional/functional-parameters': 'off',
  'functional/no-expression-statements': 'off',
  'functional/no-conditional-statements': 'off',
  'functional/no-loop-statements': 'error',
};

// Plugin rules only
const pluginRulesOnly = {
  'effect/no-unnecessary-pipe-wrapper': 'error',
  'effect/prefer-match-tag': 'error',
  'effect/prefer-match-over-conditionals': 'error',
  'effect/prefer-schema-validation-over-assertions': 'error',
};

// Recommended: Core Effect + basic pipe best practices
const recommendedRulesOnly = {
  ...pluginRulesOnly,
  ...effectRecommendedRules,
  'no-restricted-syntax': ['error', ...pipeRecommendedRestrictions],
};

// Strict: Recommended + no-gen + prefer-match + strict-pipe
const strictRulesOnly = {
  ...pluginRulesOnly,
  ...effectRecommendedRules,
  ...noGenRules,
  'no-restricted-syntax': [
    'error',
    ...preferMatchRestrictions,
    ...pipeRecommendedRestrictions,
    ...pipeStrictRestrictions,
  ],
};

// Individual opt-in configs
const noGenRulesOnly = {
  ...noGenRules,
};

const preferMatchRulesOnly = {
  'no-restricted-syntax': ['error', ...preferMatchRestrictions],
};

const pipeStrictRulesOnly = {
  'no-restricted-syntax': ['error', ...pipeStrictRestrictions],
};

// Exported configs
export const pluginRules = () => ({
  name: '@codeforbreakfast/eslint-effect/plugin',
  rules: pluginRulesOnly,
});

export const recommended = () => ({
  name: '@codeforbreakfast/eslint-effect/recommended',
  rules: recommendedRulesOnly,
});

export const strict = () => ({
  name: '@codeforbreakfast/eslint-effect/strict',
  rules: strictRulesOnly,
});

export const noGen = () => ({
  name: '@codeforbreakfast/eslint-effect/no-gen',
  rules: noGenRulesOnly,
});

export const preferMatch = () => ({
  name: '@codeforbreakfast/eslint-effect/prefer-match',
  rules: preferMatchRulesOnly,
});

export const pipeStrict = () => ({
  name: '@codeforbreakfast/eslint-effect/pipe-strict',
  rules: pipeStrictRulesOnly,
});

// Export raw restriction arrays for advanced use cases
export const syntaxRestrictions = {
  pipeStrict: pipeStrictRestrictions,
};
