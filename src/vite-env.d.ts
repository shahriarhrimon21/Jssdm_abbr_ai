/// <reference types="vite/client" />

/**
 * Side-effect stylesheet imports (`import "./styles/app.css"`) are a Vite
 * feature, not a TypeScript one, so without a declaration the compiler
 * reports the import in main.tsx as an unresolvable module. The triple-
 * slash reference above pulls in Vite's own client types where they are
 * installed; this fallback declaration keeps the check clean in
 * environments where they are not.
 */
declare module "*.css";
declare module "*.svg";
