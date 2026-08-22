import { defineConfig } from 'eslint/config';
import sektek from '@sektek/eslint-plugin';

export default defineConfig([
  sektek.configs.typescript,
  {
    rules: {
      // Import blocks, top to bottom: Node built-ins, then dependencies
      // (external packages and local workspace packages alike), then
      // local (relative) files — a blank line between each block.
      'import/order': [
        'error',
        {
          groups: [
            'builtin',
            ['external', 'internal'],
            ['parent', 'sibling', 'index'],
          ],
          'newlines-between': 'always',
        },
      ],
    },
  },
  {
    // check-file's naming rule only covers .js/.ts by default; extend it
    // to .tsx too, kebab-case to match every other file in this repo
    // (not React's usual PascalCase).
    files: ['**/*.tsx'],
    rules: {
      'check-file/filename-naming-convention': [
        'error',
        { '**/*.tsx': 'KEBAB_CASE' },
      ],
    },
  },
]);
