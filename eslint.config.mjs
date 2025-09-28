import typescript from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';

// Shared configuration pieces
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
  import: importPlugin,
};

// Common Effect-related syntax restrictions
const effectSyntaxRestrictions = [
  {
    selector: 'CallExpression[callee.object.name="Effect"][callee.property.name="gen"]',
    message: 'Effect.gen is forbidden. Use pipe and Effect.all/Effect.forEach instead.',
  },
  {
    selector: 'MemberExpression[object.name="Effect"][property.name="gen"]',
    message: 'Effect.gen is forbidden. Use pipe and Effect.all/Effect.forEach instead.',
  },
  {
    selector:
      'ClassDeclaration:not(:has(CallExpression[callee.object.name="Data"][callee.property.name="TaggedError"])):not(:has(CallExpression[callee.object.name="Effect"][callee.property.name="Tag"])):not(:has(CallExpression[callee.object.name="Context"][callee.property.name="Tag"])):not(:has(CallExpression[callee.object.name="Context"][callee.property.name="GenericTag"])):not(:has(CallExpression[callee.object.name="Schema"][callee.property.name="Class"]))',
    message:
      'Classes are forbidden in functional programming. Only Effect service tags (extending Context.Tag, Effect.Tag, or Context.GenericTag), error classes (extending Data.TaggedError), and Schema classes (extending Schema.Class) are allowed.',
  },
];

// Test-specific syntax restrictions
const testSyntaxRestrictions = [
  {
    selector: 'CallExpression[callee.object.name="Effect"][callee.property.name="runPromise"]',
    message:
      'Use it.effect() from @codeforbreakfast/buntest instead of Effect.runPromise() in tests.',
  },
  {
    selector: 'CallExpression[callee.object.name="Effect"][callee.property.name="runSync"]',
    message: 'Use it.effect() from @codeforbreakfast/buntest instead of Effect.runSync() in tests.',
  },
];

export default [
  {
    name: 'typescript-base',
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: commonLanguageOptions,
    plugins: commonPlugins,
    rules: {
      ...typescript.configs['recommended'].rules,
      ...prettier.rules,
      'unused-imports/no-unused-imports': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
      'import/extensions': [
        'error',
        'never',
        {
          js: 'never',
          ts: 'never',
          tsx: 'never',
        },
      ],
    },
  },
  {
    name: 'effect-coding-standards',
    files: [
      '**/*.ts',
      '**/*.tsx',
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.spec.ts',
      '**/*.spec.tsx',
    ],
    languageOptions: commonLanguageOptions,
    plugins: {
      '@typescript-eslint': typescript,
    },
    rules: {
      'no-restricted-syntax': ['error', ...effectSyntaxRestrictions],
    },
  },
  {
    name: 'buntest-integration',
    files: ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
    languageOptions: commonLanguageOptions,
    plugins: commonPlugins,
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['bun:test'],
              message:
                'Test files should prefer "@codeforbreakfast/buntest" over "bun:test" for better Effect integration. Use buntest unless you specifically need bun:test features.',
            },
          ],
        },
      ],
      'no-restricted-syntax': ['error', ...effectSyntaxRestrictions, ...testSyntaxRestrictions],
    },
  },
  {
    name: 'ignore-patterns',
    ignores: ['**/node_modules/**', '**/dist/**', '**/build/**', '**/*.js', '**/*.mjs'],
  },
];
