'use strict';

// ESLint 9 Flat Config — ARN Marine Navigator
const globals = require('globals');

module.exports = [
  {
    ignores: ['node_modules/**', 'dist/**', 'build/**', 'coverage/**', 'data/**', 'assets/fonts/**']
  },
  {
    files: ['DesktopApp/**/*.js', 'tools/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs'
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-undef': 'error',
      'no-var': 'warn',
      'prefer-const': 'warn',
      eqeqeq: ['warn', 'smart'],
      'no-constant-condition': ['error', { checkLoops: false }]
    }
  },
  {
    // العملية الرئيسية وأدوات البناء والاختبارات — بيئة Node.js
    files: ['DesktopApp/*.js', 'tools/**/*.js', 'tests/**/*.js', 'eslint.config.js'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    // الواجهة الرسومية — سياق متصفح معزول (contextIsolation)
    files: ['DesktopApp/renderer/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser
      }
    }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  }
];
