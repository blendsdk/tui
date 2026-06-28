// ESLint flat config (RD-01, PL-2).
//
// Uses the typescript-eslint recommended rule set for all TypeScript sources
// (including test files, which ship no code but must stay clean), with
// eslint-config-prettier last so Prettier owns all formatting decisions.
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', '_archive', '**/coverage/**', '**/.turbo/**'] },
  ...tseslint.configs.recommended,
  prettier,
  {
    // Honour the `_`-prefix convention for intentionally-unused, reserved
    // parameters/variables (e.g. a param kept for a deferred branch point).
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
    },
  },
);
