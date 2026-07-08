// Publikt API för SRU-modulen — se docs/deklarationsmodul-spec.md.
// Ren TypeScript utan IO/serverberoenden: fungerar i webbläsare och Node.

export * from './types';
export { SruError, encodeLatin1, decodeLatin1, isAllowedChar, assertAllowedText } from './encoding';
export { toIdNumber12, luhnValid, luhnCheckDigit } from './idnummer';
export { serialize, normalizePackage } from './serialize';
export { parseInfo, parseBlanketter } from './parse';
export type { ParsedInfo } from './parse';
