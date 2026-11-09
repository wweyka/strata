// Web: the browser's localStorage, scoped to this origin. Server-side rendering is off
// (web.output = "single"), so window is always available here.
export const sessionStorage = {
  getItem: (key: string) => Promise.resolve(globalThis.localStorage?.getItem(key) ?? null),
  setItem: (key: string, value: string) => Promise.resolve(globalThis.localStorage?.setItem(key, value)),
  removeItem: (key: string) => Promise.resolve(globalThis.localStorage?.removeItem(key)),
};
