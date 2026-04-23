module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    // NestJS patterns need `any` for request/response transforms and decorator payloads.
    '@typescript-eslint/no-explicit-any': 'off',
    // Dependency-injected fields in NestJS are often unused at construction time — tolerate via `_` prefix.
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    // Prisma query shapes often produce legitimate `any` until the client is regenerated.
    '@typescript-eslint/no-var-requires': 'off',
    'no-empty': ['error', { allowEmptyCatch: false }],
    'no-console': 'off',
    // Downgraded from error to warn to avoid conflicting with in-flight PR work on whatif.service.ts.
    'prefer-const': 'warn',
  },
  ignorePatterns: ['dist/', 'node_modules/', 'prisma/migrations/', '.eslintrc.js'],
};
