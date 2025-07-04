import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintPluginReact from 'eslint-plugin-react';
import eslintPluginReactHooks from 'eslint-plugin-react-hooks';
import eslintPluginReactRefresh from 'eslint-plugin-react-refresh';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginImport from 'eslint-plugin-import';
import eslintPluginSecurity from 'eslint-plugin-security';
import eslintPluginUnicorn from 'eslint-plugin-unicorn';
import eslintPluginSonarjs from 'eslint-plugin-sonarjs';

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/out/**",
      "**/.turbo/**",
      "**/.eslintcache/**",
      "**/coverage/**",
      "**/*.min.js",
      "**/*.min.css",
      "**/.git/**",
      "**/tmp/**",
      "**/temp/**",
      "**/electron-builder.js",
      "**/pnpm-lock.yaml",
      "**/.env*",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    plugins: {
      import: eslintPluginImport,
      security: eslintPluginSecurity,
      unicorn: eslintPluginUnicorn,
      sonarjs: eslintPluginSonarjs,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/explicit-function-return-type': ['error', { allowExpressions: true }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/strict-boolean-expressions': ['error', {
        allowString: false,
        allowNumber: false,
        allowNullableObject: true,
      }],
      
      // Import rules
      'import/no-duplicates': 'error',
      'import/no-cycle': 'error',
      'import/no-self-import': 'error',
      'import/no-useless-path-segments': 'error',
      
      // Security rules
      'security/detect-object-injection': 'warn',
      'security/detect-non-literal-fs-filename': 'error',
      'security/detect-eval-with-expression': 'error',
      'security/detect-unsafe-regex': 'error',
      
      // Code quality rules
      'sonarjs/cognitive-complexity': ['error', 15],
      'sonarjs/no-duplicate-string': ['error', { threshold: 3 }],
      'sonarjs/no-identical-functions': 'error',
      'sonarjs/no-collapsible-if': 'error',
      
      // Unicorn best practices
      'unicorn/filename-case': ['error', { case: 'kebabCase' }],
      'unicorn/no-array-reduce': 'error',
      'unicorn/prefer-node-protocol': 'error',
      'unicorn/prefer-module': 'error',
      
      // General rules
      'no-console': ['error', { allow: ['error', 'warn'] }],
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['warn', { max: 75, skipBlankLines: true, skipComments: true }],
      
      // Forbidden patterns
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ImportDeclaration[source.value=/\\.js$/]',
          message: 'Do not use .js extension in TypeScript imports',
        },
      ],
      
      // Path restrictions
      'import/no-restricted-paths': ['error', {
        zones: [
          {
            target: './apps/electron-app/src/renderer',
            from: './apps/electron-app/src/main',
            message: 'Renderer cannot import from main process',
          },
          {
            target: './packages/*',
            from: './apps/*',
            message: 'Packages cannot import from apps',
          },
        ],
      }],
    },
  },
  // React-specific configuration
  {
    files: ["**/apps/electron-app/**/*.{ts,tsx}"],
    ...eslintPluginReact.configs.flat.recommended,
    ...eslintPluginReact.configs.flat['jsx-runtime'],
    plugins: {
      'react-hooks': eslintPluginReactHooks,
      'react-refresh': eslintPluginReactRefresh,
    },
    settings: {
      react: {
        version: 'detect',
      },
    },
    rules: {
      ...eslintPluginReactHooks.configs.recommended.rules,
      ...eslintPluginReactRefresh.configs.vite.rules,
      'react/prop-types': 'off',
    },
  },
  // Config files
  {
    files: ["**/*.config.{js,mjs,cjs}", "**/scripts/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        module: 'readonly',
        exports: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        setTimeout: 'readonly',
        setInterval: 'readonly',
        clearTimeout: 'readonly',
        clearInterval: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-var-requires': 'off',
      'no-console': 'off',
    },
  },
  // Test files
  {
    files: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/test/**/*.{ts,tsx}"],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  eslintConfigPrettier,
); 
