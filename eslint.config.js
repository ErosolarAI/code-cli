import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import complexityPlugin from 'eslint-plugin-complexity';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

const tsFiles = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];

const tsRecommendedRules = tsPlugin.configs.recommended?.rules ?? {};

const customTypeScriptRules = {
  complexity: ['error', 40],
  'no-undef': 'off',
  '@typescript-eslint/no-explicit-any': 'off',
  '@typescript-eslint/no-unsafe-assignment': 'off',
  '@typescript-eslint/no-unsafe-member-access': 'off',
  '@typescript-eslint/no-unsafe-call': 'off',
  '@typescript-eslint/no-unsafe-return': 'off',
  '@typescript-eslint/explicit-function-return-type': 'off',
  '@typescript-eslint/explicit-module-boundary-types': 'off',
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    },
  ],
  '@typescript-eslint/prefer-nullish-coalescing': 'off',
  '@typescript-eslint/prefer-optional-chain': 'off',
  '@typescript-eslint/no-floating-promises': 'off',
  '@typescript-eslint/await-thenable': 'off',
  '@typescript-eslint/consistent-type-imports': 'off',
};

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'apt-angular/**',
      'claude-code/**',
      'coverage/**',
      'examples/**',
      '**/*.d.ts',
    ],
  },
  {
    ...js.configs.recommended,
    languageOptions: {
      ...js.configs.recommended?.languageOptions,
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    files: tsFiles,
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      complexity: complexityPlugin,
    },
    rules: {
      ...tsRecommendedRules,
      ...(prettierConfig.rules ?? {}),
      ...customTypeScriptRules,
    },
  },
];
