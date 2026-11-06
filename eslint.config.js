import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['**/dist/**', '**/.wrangler/**']),
  {
    files: ['**/*.ts', '**/*.tsx'],
    extends: [tseslint.configs.recommended],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['**/legacy/**', '@erp/api', '@erp/web'], message: 'Use contratos públicos; não importe o legado ou outro app.' }],
      }],
    },
  },
]);
