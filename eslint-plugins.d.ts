/* eslint-plugin-lit-a11y ships no types; eslint.config.ts reads only its `configs.recommended`. */
declare module 'eslint-plugin-lit-a11y' {
  import type { Linter } from 'eslint';
  const plugin: { configs: { recommended: Linter.Config } };
  export default plugin;
}
