import typescript from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import unusedImports from 'eslint-plugin-unused-imports';
import importPlugin from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';

export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': typescript,
      'unused-imports': unusedImports,
      import: importPlugin,
    },
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
      'no-restricted-syntax': [
        'error',
        {
          selector: 'CallExpression[callee.object.name="Effect"][callee.property.name="gen"]',
          message: 'Effect.gen is forbidden. Use pipe and Effect.all/Effect.forEach instead.',
        },
        {
          selector: 'MemberExpression[object.name="Effect"][property.name="gen"]',
          message: 'Effect.gen is forbidden. Use pipe and Effect.all/Effect.forEach instead.',
        },
      ],
    },
  },
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/lib/**', '**/*.js', '**/*.mjs'],
  },
];
