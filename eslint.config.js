export default [
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Browser globals
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        requestAnimationFrame: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        Audio: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        Uint8Array: 'readonly',
        URL: 'readonly',
        // Browser extension globals
        chrome: 'readonly',
        browser: 'readonly',
        // Node test globals (for test files)
        globalThis: 'readonly'
      }
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-undef': 'error',
      'no-constant-condition': 'warn',
      'no-debugger': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-unreachable': 'error',
      'eqeqeq': ['warn', 'smart'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-throw-literal': 'warn',
      'prefer-const': 'warn'
    }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly'
      }
    }
  },
  {
    ignores: ['node_modules/**']
  }
];
