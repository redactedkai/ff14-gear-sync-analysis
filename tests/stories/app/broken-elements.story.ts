/* Stories of the deliberately broken elements (broken-elements.js) and of a TypeScript element with a class field. */
import { html } from 'lit';
import './broken-elements.ts';
import './ts-field-element.ts';

/* A JavaScript class field next to `static properties`: Lit's development build throws on the first update. */
export const ClassFieldTrap = ({ count = 1 } = {}) => html`<broken-field .count=${count}></broken-field>`;

/* An element whose render() throws. */
export const ThrowingRender = () => html`<throwing-render></throwing-render>`;

/* A TypeScript class field with an initializer: the build assigns it in the constructor (useDefineForClassFields false), so it works. */
export const TypeScriptField = ({ count = 1 } = {}) => html`<ts-field .count=${count}></ts-field>`;
