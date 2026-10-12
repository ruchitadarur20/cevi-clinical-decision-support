import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { plugins: { 'react-hooks': reactHooks }, rules: { ...reactHooks.configs.recommended.rules,
    // Intentional: dialogs reset their form when opened and the mobile nav closes on route change.
    'react-hooks/set-state-in-effect': 'off', '@typescript-eslint/no-explicit-any': 'off', '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }] } },
  { ignores: ['dist', 'node_modules'] },
);
