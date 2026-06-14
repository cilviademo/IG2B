// Build identity, injected by Vite `define` at build time (see vite.config.ts).
// Lets the running PWA show exactly which build/commit it is — the core of the
// "are Safari and the installed PWA the same build?" diagnosis.
declare const __BUILD_COMMIT__: string;
declare const __BUILD_TIME__: string;

export const BUILD_COMMIT: string = typeof __BUILD_COMMIT__ !== "undefined" ? __BUILD_COMMIT__ : "dev";
export const BUILD_TIME: string = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "";
