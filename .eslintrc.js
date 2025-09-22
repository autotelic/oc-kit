module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended'
  ],
  env: {
    node: true,
    es2022: true
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module'
  },
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    'no-console': 'error',
    'no-empty': ['error', { allowEmptyCatch: false }],
    '@typescript-eslint/no-empty-function': ['error', { allow: [] }]
  },
  overrides: [
    {
      files: ['examples/**/*.ts'],
      rules: {
        'no-console': 'off'
      }
    }
  ]
}