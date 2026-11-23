/* ESLint for the Lit templates, next to Biome. Biome lints and formats every file but cannot read the markup inside
   html`...` templates; ESLint with eslint-plugin-lit and eslint-plugin-lit-a11y does, and only for the Lit elements
   (src/ui/elements/**). Biome keeps formatting and the plain JavaScript rules, so no ESLint core rule is switched on here
   and no rule is on in both tools. `npm run lint:lit` runs it; the test tests/unit/scripts/lint-lit.test.js proves the
   config still loads both plugins by linting the fixture below. */
import lit from 'eslint-plugin-lit';
import litA11y from 'eslint-plugin-lit-a11y';
import tseslint from 'typescript-eslint';

/* The folders the rules apply to: the Lit elements, and the fixture the test lints (`npm run lint:lit` names only the
   elements folder, so the fixture never fails the lint). */
export const LIT_FILES = ['src/ui/elements/**/*.{js,ts}', 'tests/unit/scripts/fixtures/lit-lint/**/*.{js,ts}'];

export default [
  {
    files: LIT_FILES,
    // typescript-eslint's parser reads .js and .ts alike
    languageOptions: { parser: tseslint.parser },
    // an inline `// eslint-disable` of a rule that is not on would hide nothing; report it
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  { ...lit.configs['flat/recommended'], files: LIT_FILES },
  { ...litA11y.configs.recommended, files: LIT_FILES },
  {
    files: LIT_FILES,
    rules: {
      // a class field next to `static properties` shadows Lit's accessor (the property stays at its first value)
      'lit/no-classfield-shadowing': 'error',
    },
  },
];
