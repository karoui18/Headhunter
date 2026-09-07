import { FlatCompat } from '@eslint/eslintrc';
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
const config = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      'out/**',
      '.next/**',
      'node_modules/**',
      'next-env.d.ts',
      'public/sw.js',
      'playwright-report/**',
      'test-results/**',
    ],
  },
];

export default config;
