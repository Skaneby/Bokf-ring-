// Datamodell för SRU-export — se docs/deklarationsmodul-spec.md §5, §7.
// Domänlagret bygger SruPackage; serialiseraren känner inte till bokföringen.

export interface SruTimestamp {
  date: string; // ÅÅÅÅMMDD — fryses av anroparen vid exporttillfället
  time: string; // TTMMSS
}

export interface SruProgram {
  name: string;
  version: string;
}

// Uppgiftslämnarens kontaktuppgifter → INFO.SRU #MEDIELEV-blocket
export interface SruSender {
  orgNumber: string; // 10 eller 12 siffror; normaliseras till 12 med sekelprefix
  name: string;
  address?: string;
  postalCode?: string;
  city?: string;
  contact?: string;
  email?: string;
  phone?: string;
}

export interface SruUppgift {
  fieldCode: string; // fältkod/SRU-kod, t.ex. "7410"
  value: string;     // redan formaterat värde — serialiseraren formaterar inte belopp
}

export interface SruBlankett {
  formCode: string;  // blankettkod inkl. årsversion, t.ex. "INK2R-2026P1"
  idNumber: string;  // deklarantens org-/personnummer (10 eller 12 siffror)
  name?: string;
  uppgifter: SruUppgift[];
}

export interface SruPackage {
  createdAt: SruTimestamp; // ingen klocka i serialiseraren — determinism
  program: SruProgram;
  sender: SruSender;
  blanketter: SruBlankett[];
}

export interface SruFiles {
  info: Uint8Array;       // INFO.SRU — filnamnet får aldrig ändras
  blanketter: Uint8Array; // BLANKETTER.SRU — max 5 MB, filnamnet får aldrig ändras
}

export const SRU_FILENAME_INFO = 'INFO.SRU';
export const SRU_FILENAME_BLANKETTER = 'BLANKETTER.SRU';
export const SRU_MAX_BLANKETTER_BYTES = 5 * 1024 * 1024; // 5 MB — Skatteverkets gräns
