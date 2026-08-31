// Minimal lint config with one job: catch references to names that do not
// exist.
//
// This exists because of a real failure. Removing a `const transferTube` left
// one line still assigning `transferTube.visible`, which `node --check` cannot
// see -- it checks syntax, not scope -- so the page threw at runtime and only
// the browser smoke test in CI caught it, several minutes later.
//
//   npx eslint .
//
// Deliberately not a style config. The rules below are the ones whose failures
// are always bugs.

import js from '@eslint/js';

export default [
  {
    ignores: ['node_modules/**', 'public/data/**'],
  },
  {
    ...js.configs.recommended,
    files: ['src/**/*.js', 'scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        // Browser globals used by the scenes.
        document: 'readonly',
        window: 'readonly',
        devicePixelRatio: 'readonly',
        innerWidth: 'readonly',
        innerHeight: 'readonly',
        addEventListener: 'readonly',
        removeEventListener: 'readonly',
        navigator: 'readonly',
        performance: 'readonly',
        requestAnimationFrame: 'readonly',
        cancelAnimationFrame: 'readonly',
        fetch: 'readonly',
        console: 'readonly',
        ResizeObserver: 'readonly',
        Event: 'readonly',
        CustomEvent: 'readonly',
        Image: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        localStorage: 'readonly',
        getComputedStyle: 'readonly',
        // Node globals used by the check scripts.
        process: 'readonly',
        globalThis: 'readonly',
        Buffer: 'readonly',
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-undef': 'error',
      'no-unused-vars': ['warn', { args: 'none', varsIgnorePattern: '^_' }],
      // Style is not this config's business.
      'no-empty': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
    },
  },
];
