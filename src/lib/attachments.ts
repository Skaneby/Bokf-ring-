// P5 — kvittobilagor: bilder/PDF:er kopplade till verifikat.
// Lagras som ArrayBuffer i IndexedDB (db.attachments); Blob skapas först
// vid visning. Bilagor följer med i JSON-backupen som base64 (backup.ts).

import { db, Attachment } from '../db';

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024; // 8 MB per bilaga
export const ALLOWED_ATTACHMENT_TYPES = /^(image\/|application\/pdf$)/;

export class AttachmentError extends Error {}

export function validateAttachmentFile(file: { size: number; type: string; name: string }): void {
  if (!ALLOWED_ATTACHMENT_TYPES.test(file.type)) {
    throw new AttachmentError(`"${file.name}" är varken bild eller PDF — andra filtyper stöds inte.`);
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new AttachmentError(
      `"${file.name}" är ${(file.size / 1048576).toFixed(1)} MB — max 8 MB per bilaga.`,
    );
  }
}

export async function addAttachment(voucherId: number, file: File): Promise<number> {
  validateAttachmentFile(file);
  const data = await file.arrayBuffer();
  return (await db.attachments.add({
    voucherId,
    name: file.name,
    type: file.type,
    size: data.byteLength,
    data,
    created_at: Date.now(),
  })) as number;
}

export async function deleteAttachment(id: number): Promise<void> {
  await db.attachments.delete(id);
}

// Kaskad: anropas när ett verifikat raderas
export async function deleteAttachmentsForVoucher(voucherId: number): Promise<void> {
  await db.attachments.where('voucherId').equals(voucherId).delete();
}

export function attachmentCounts(attachments: Attachment[]): Map<number, number> {
  const map = new Map<number, number>();
  for (const a of attachments) map.set(a.voucherId, (map.get(a.voucherId) ?? 0) + 1);
  return map;
}

// Öppnar bilagan i ny flik (bild/PDF renderas av webbläsaren)
export function openAttachment(att: Attachment): void {
  const url = URL.createObjectURL(new Blob([att.data], { type: att.type }));
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

// ── Base64 (för JSON-backup) — ren JS, fungerar i webbläsare och Node ────────

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function bufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i], b1 = bytes[i + 1], b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 === undefined ? 0 : b1 >> 4)];
    out += b1 === undefined ? '=' : B64[((b1 & 15) << 2) | (b2 === undefined ? 0 : b2 >> 6)];
    out += b2 === undefined ? '=' : B64[b2 & 63];
  }
  return out;
}

export function base64ToBuffer(b64: string): ArrayBuffer {
  const clean = b64.replace(/=+$/, '');
  const bytes: number[] = [];
  let bits = 0, value = 0;
  for (const ch of clean) {
    const idx = B64.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 6) | idx;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes).buffer;
}
