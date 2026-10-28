import nextPlugin from '@next/eslint-plugin-next';
import tsParser from '@typescript-eslint/parser';

export default [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  {
    plugins: { '@next/next': nextPlugin },
    rules: {
      ...Object.fromEntries(Object.entries(nextPlugin.configs.recommended.rules).map(([name, value]) => [name, Array.isArray(value) ? ['error', ...value.slice(1)] : 'error'])),
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parser: tsParser, parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } } },
  },
];
