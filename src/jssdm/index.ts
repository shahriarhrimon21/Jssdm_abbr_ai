/** Barrel export for the JSSDM engine — a faithful TypeScript port of the
 *  working vanilla-JS engine in /tmp/mil/shell_bottom.html, including the
 *  Personnel/pers reverse-ambiguity fix (see forceResolution.ts). */
export * from "./types.ts";
export * from "./database.ts";
export * from "./parser.ts";
export * from "./ruleEngine.ts";
export * from "./forceResolution.ts";
export * from "./abbreviationEngine.ts";
export * from "./deabbreviationEngine.ts";
export * from "./consistency.ts";
export * from "./validation.ts";
export * from "./audit.ts";
export * from "./search.ts";
export * from "./rules.ts";
export * from "./favorites.ts";
