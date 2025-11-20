module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'complexity'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    complexity: ['error', 40], // Adjust the complexity threshold as needed
    '@typescript-eslint/no-explicit-any': 'warn',
  },
};
