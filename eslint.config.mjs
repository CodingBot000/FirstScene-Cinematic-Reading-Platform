import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', 'content/generated/**', 'evidence/**', 'test-results/**', 'playwright-report/**', 'artifacts/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { languageOptions: { globals: { process: 'readonly', console: 'readonly', URL: 'readonly', fetch: 'readonly', Buffer: 'readonly', window: 'readonly', document: 'readonly' } } },
  { files: ['**/*.{ts,tsx}'], plugins: { 'react-hooks': hooks }, rules: { ...hooks.configs.recommended.rules, '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } }
);
