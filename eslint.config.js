import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'release/**',
      'build/**',
      'ui/node_modules/**',
      'ui/dist/**',
      'ui/release/**',
      '*.config.js',
      '*.config.ts',
      'vite.config.ts'
    ]
  },
  {
    files: ['ui/src/**/*.{ts,tsx}'],
    ...(await import('./ui/eslint.config.js')).default.find(c => c.files?.[0]?.includes('**/*.{ts,tsx}'))
  },
  {
    files: ['ui/src/**/*.js'],
    ...(await import('./ui/eslint.config.js')).default.find(c => c.files?.[0]?.includes('**/*.js'))
  }
];