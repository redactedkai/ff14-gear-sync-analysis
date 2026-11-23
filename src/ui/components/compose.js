/* Putting a component together from parts (the set page's and the Sheets tab's): each part is an object of members, and the
   parts share `this` when Alpine runs the component, so a part calls another's members. */

/* One object with every member of `parts`, getters kept as getters (a spread would read them once). Throws when two parts
   define the same member: the later one would silently replace the earlier, and the page would call the wrong one. */
export function compose(...parts) {
  const component = {};
  for (const part of parts) {
    const members = Object.getOwnPropertyDescriptors(part);
    for (const name of Reflect.ownKeys(members)) {
      if (name in component) throw new Error(`Two parts both define "${String(name)}"`);
    }
    Object.defineProperties(component, members);
  }
  return component;
}
