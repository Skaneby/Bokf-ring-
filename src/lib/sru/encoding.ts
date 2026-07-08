// Teckenkodning för SRU-filer: ISO 8859-1 (Latin-1).
// VERIFIERAS: encoding ska stämmas av mot Skatteverkets tekniska beskrivning
// innan produktion — bytet är isolerat till denna modul.

export class SruError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'SruError';
  }
}

// Tillåtna tecken i fältvärden: skrivbara Latin-1 (utan kontrolltecken).
// 0x20–0x7E (ASCII) + 0xA0–0xFF (åäö m.fl.). CR/LF är strukturella och
// tillåts aldrig inuti värden.
export function isAllowedChar(codePoint: number): boolean {
  return (codePoint >= 0x20 && codePoint <= 0x7e) || (codePoint >= 0xa0 && codePoint <= 0xff);
}

export function assertAllowedText(text: string, context: string): void {
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (!isAllowedChar(cp)) {
      throw new SruError(
        'SRU-ENC-01',
        `Otillåtet tecken "${ch}" (U+${cp.toString(16).toUpperCase().padStart(4, '0')}) i ${context}. ` +
        `Endast tecken ur Latin-1 tillåts i SRU-filer.`,
      );
    }
  }
}

// Ren Latin-1-kodning — fungerar identiskt i Node och webbläsare
// (TextEncoder stöder bara UTF-8, därav manuell kodning).
export function encodeLatin1(text: string): Uint8Array {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0xff) {
      throw new SruError('SRU-ENC-01', `Tecknet "${text[i]}" kan inte kodas i Latin-1.`);
    }
    out[i] = code;
  }
  return out;
}

export function decodeLatin1(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}
