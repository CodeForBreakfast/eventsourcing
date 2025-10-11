import typescript from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';
import prettier from 'eslint-config-prettier';
import functionalPlugin from 'eslint-plugin-functional';
import effectPlugin from './src/index.js';

const commonLanguageOptions = {
  parser,
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
};

const commonPlugins = {
  '@typescript-eslint': typescript,
  'unused-imports': unusedImports,
  functional: functionalPlugin,
  effect: {
    rules: effectPlugin.rules,
  },
};

const typescriptBaseRules = {
  ...typescript.configs['recommended'].rules,
  ...prettier.rules,
  'unused-imports/no-unused-imports': 'error',
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/no-explicit-any': 'error',
};

export default [
  {
    name: 'eslint-effect-typescript-base',
    files: ['test/**/*.ts', 'test/**/*.tsx'],
    languageOptions: commonLanguageOptions,
    plugins: commonPlugins,
    rules: {
      ...typescriptBaseRules,
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
  {
    name: 'eslint-effect-test-isolation',
    files: ['test/**/*.ts', 'test/**/*.tsx'],
    languageOptions: commonLanguageOptions,
    plugins: commonPlugins,
    rules: {
      // Each test file should only enable the rule it's testing
      // All other effect and functional rules are disabled by default
      'functional/prefer-readonly-type': 'off',
      'effect/no-classes': 'off',
      'effect/no-curried-calls': 'off',
      'effect/no-direct-tag-access': 'off',
      'effect/no-eta-expansion': 'off',
      'effect/no-gen': 'off',
      'effect/no-identity-transform': 'off',
      'effect/no-if-statement': 'off',
      'effect/no-intermediate-effect-variables': 'off',
      'effect/no-method-pipe': 'off',
      'effect/no-nested-pipe': 'off',
      'effect/no-nested-pipes': 'off',
      'effect/no-pipe-first-arg-call': 'off',
      'effect/no-runPromise': 'off',
      'effect/no-runSync': 'off',
      'effect/no-switch-statement': 'off',
      'effect/no-unnecessary-function-alias': 'off',
      'effect/no-unnecessary-pipe-wrapper': 'off',
      'effect/prefer-andThen': 'off',
      'effect/prefer-as': 'off',
      'effect/prefer-as-void': 'off',
      'effect/prefer-as-some': 'off',
      'effect/prefer-as-some-error': 'off',
      'effect/prefer-flatten': 'off',
      'effect/prefer-zip-left': 'off',
      'effect/prefer-zip-right': 'off',
      'effect/prefer-ignore': 'off',
      'effect/prefer-ignore-logged': 'off',
      'effect/prefer-from-nullable': 'off',
      'effect/prefer-get-or-else': 'off',
      'effect/prefer-get-or-null': 'off',
      'effect/prefer-effect-if-over-match-boolean': 'off',
      'effect/prefer-effect-platform': 'off',
      'effect/prefer-match-over-conditionals': 'off',
      'effect/prefer-match-over-ternary': 'off',
      'effect/prefer-match-tag': 'off',
      'effect/prefer-schema-validation-over-assertions': 'off',
      'effect/suggest-currying-opportunity': 'off',
    },
  },
  // Per-file rule enablement - each test file enables only its own rule
  {
    name: 'no-classes-test',
    files: ['test/no-classes.test.ts'],
    rules: { 'effect/no-classes': 'error' },
  },
  {
    name: 'no-curried-calls-test',
    files: ['test/no-curried-calls.test.ts'],
    rules: { 'effect/no-curried-calls': 'error' },
  },
  {
    name: 'no-direct-tag-access-test',
    files: ['test/no-direct-tag-access.test.ts'],
    rules: { 'effect/no-direct-tag-access': 'error' },
  },
  {
    name: 'no-eta-expansion-test',
    files: ['test/no-eta-expansion.test.ts'],
    rules: { 'effect/no-eta-expansion': 'error' },
  },
  {
    name: 'no-gen-test',
    files: ['test/no-gen.test.ts'],
    rules: { 'effect/no-gen': 'error' },
  },
  {
    name: 'no-if-statement-test',
    files: ['test/no-if-statement.test.ts'],
    rules: { 'effect/no-if-statement': 'error' },
  },
  {
    name: 'no-intermediate-effect-variables-test',
    files: ['test/no-intermediate-effect-variables.test.ts'],
    rules: { 'effect/no-intermediate-effect-variables': 'error' },
  },
  {
    name: 'no-method-pipe-test',
    files: ['test/no-method-pipe.test.ts'],
    rules: { 'effect/no-method-pipe': 'error' },
  },
  {
    name: 'no-nested-pipe-test',
    files: ['test/no-nested-pipe.test.ts'],
    rules: { 'effect/no-nested-pipe': 'error' },
  },
  {
    name: 'no-nested-pipes-test',
    files: ['test/no-nested-pipes.test.ts'],
    rules: { 'effect/no-nested-pipes': 'error' },
  },
  {
    name: 'no-pipe-first-arg-call-test',
    files: ['test/no-pipe-first-arg-call.test.ts'],
    rules: { 'effect/no-pipe-first-arg-call': 'error' },
  },
  {
    name: 'no-runSync-runPromise-test',
    files: ['test/no-runSync-runPromise.test.ts'],
    rules: {
      'effect/no-runSync': 'error',
      'effect/no-runPromise': 'error',
    },
  },
  {
    name: 'no-switch-statement-test',
    files: ['test/no-switch-statement.test.ts'],
    rules: { 'effect/no-switch-statement': 'error' },
  },
  {
    name: 'no-unnecessary-function-alias-test',
    files: ['test/no-unnecessary-function-alias.test.ts'],
    rules: { 'effect/no-unnecessary-function-alias': 'error' },
  },
  {
    name: 'no-unnecessary-pipe-wrapper-test',
    files: ['test/no-unnecessary-pipe-wrapper.test.ts'],
    rules: { 'effect/no-unnecessary-pipe-wrapper': 'error' },
  },
  {
    name: 'prefer-andThen-test',
    files: ['test/prefer-andThen.test.ts'],
    rules: { 'effect/prefer-andThen': 'error' },
  },
  {
    name: 'prefer-as-test',
    files: ['test/prefer-as.test.ts'],
    rules: { 'effect/prefer-as': 'error' },
  },
  {
    name: 'prefer-as-void-test',
    files: ['test/prefer-as-void.test.ts'],
    rules: { 'effect/prefer-as-void': 'error' },
  },
  {
    name: 'prefer-as-some-test',
    files: ['test/prefer-as-some.test.ts'],
    rules: { 'effect/prefer-as-some': 'error' },
  },
  {
    name: 'prefer-as-some-error-test',
    files: ['test/prefer-as-some-error.test.ts'],
    rules: { 'effect/prefer-as-some-error': 'error' },
  },
  {
    name: 'prefer-flatten-test',
    files: ['test/prefer-flatten.test.ts'],
    rules: { 'effect/prefer-flatten': 'error' },
  },
  {
    name: 'prefer-zip-left-test',
    files: ['test/prefer-zip-left.test.ts'],
    rules: { 'effect/prefer-zip-left': 'error' },
  },
  {
    name: 'prefer-zip-right-test',
    files: ['test/prefer-zip-right.test.ts'],
    rules: { 'effect/prefer-zip-right': 'error' },
  },
  {
    name: 'prefer-ignore-test',
    files: ['test/prefer-ignore.test.ts'],
    rules: { 'effect/prefer-ignore': 'error' },
  },
  {
    name: 'prefer-ignore-logged-test',
    files: ['test/prefer-ignore-logged.test.ts'],
    rules: { 'effect/prefer-ignore-logged': 'error' },
  },
  {
    name: 'prefer-from-nullable-test',
    files: ['test/prefer-from-nullable.test.ts'],
    rules: { 'effect/prefer-from-nullable': 'error' },
  },
  {
    name: 'prefer-get-or-else-test',
    files: ['test/prefer-get-or-else.test.ts'],
    rules: { 'effect/prefer-get-or-else': 'error' },
  },
  {
    name: 'prefer-get-or-null-test',
    files: ['test/prefer-get-or-null.test.ts'],
    rules: { 'effect/prefer-get-or-null': 'error' },
  },
  {
    name: 'prefer-effect-platform-test',
    files: ['test/prefer-effect-platform.test.ts'],
    rules: { 'effect/prefer-effect-platform': 'error' },
  },
  {
    name: 'prefer-match-over-conditionals-test',
    files: ['test/prefer-match-over-conditionals.test.ts'],
    rules: { 'effect/prefer-match-over-conditionals': 'error' },
  },
  {
    name: 'prefer-match-over-ternary-test',
    files: ['test/prefer-match-over-ternary.test.ts'],
    rules: { 'effect/prefer-match-over-ternary': 'error' },
  },
  {
    name: 'prefer-match-tag-test',
    files: ['test/prefer-match-tag.test.ts'],
    rules: { 'effect/prefer-match-tag': 'error' },
  },
  {
    name: 'prefer-schema-validation-over-assertions-test',
    files: ['test/prefer-schema-validation-over-assertions.test.ts'],
    rules: { 'effect/prefer-schema-validation-over-assertions': 'error' },
  },
  {
    name: 'suggest-currying-opportunity-test',
    files: ['test/suggest-currying-opportunity.test.ts'],
    rules: { 'effect/suggest-currying-opportunity': 'error' },
  },
  {
    name: 'ignore-patterns',
    ignores: ['**/node_modules/**', '**/dist/**', '**/*.js', '**/*.mjs', '**/*.d.ts'],
  },
];
