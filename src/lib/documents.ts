import "server-only";
import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import { one, q } from "./db";

export const CV_MAX_BYTES = 5 * 1024 * 1024;
export const CV_ACCEPT = ".pdf,.docx,.jpg,.jpeg,.png";

/** Identify the file by its real content (magic bytes), never by the name the browser sends. */
function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: "image/png", ext: "png" };
  // DOCX = ZIP container that includes word/document.xml
  if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04 &&
      buf.includes(Buffer.from("word/"))) {
    return { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" };
  }
  return null;
}

export type CvCheck = { ok: true; buf: Buffer; mime: string; filename: string } | { ok: false; error: string };

export async function checkCv(file: FormDataEntryValue | null): Promise<CvCheck> {
  if (!file || typeof file === "string" || file.size === 0) return { ok: false, error: "إرفاق السيرة الذاتية مطلوب" };
  if (file.size > CV_MAX_BYTES) return { ok: false, error: "حجم الملف أكبر من 5 ميجابايت" };
  const buf = Buffer.from(await file.arrayBuffer());
  const type = sniff(buf);
  if (!type) return { ok: false, error: "يجب أن يكون الملف بصيغة PDF أو Word (docx) أو صورة JPG/PNG" };
  const base = (file.name || "cv").replace(/\.[^.]+$/, "").replace(/[^\p{L}\p{N} _-]/gu, "").trim().slice(0, 80) || "cv";
  return { ok: true, buf, mime: type.mime, filename: `${base}.${type.ext}` };
}

export async function saveCv(c: Pick<PoolClient, "query">, teacherId: string, cv: Extract<CvCheck, { ok: true }>, uploadedBy: string) {
  await c.query(
    `INSERT INTO teacher_documents (teacher_id, kind, filename, mime, size_bytes, sha256, data, uploaded_by)
     VALUES ($1,'cv',$2,$3,$4,$5,$6,$7)`,
    [teacherId, cv.filename, cv.mime, cv.buf.length, createHash("sha256").update(cv.buf).digest("hex"), cv.buf, uploadedBy],
  );
}

export function currentCv(teacherId: string) {
  return one<{ id: string; filename: string; mime: string; size_bytes: number; created_at: Date }>(
    `SELECT id, filename, mime, size_bytes, created_at FROM teacher_documents
      WHERE teacher_id = $1 AND kind = 'cv' ORDER BY created_at DESC LIMIT 1`, [teacherId]);
}

export function cvHistory(teacherId: string) {
  return q<{ id: string; filename: string; size_bytes: number; created_at: Date }>(
    `SELECT id, filename, size_bytes, created_at FROM teacher_documents
      WHERE teacher_id = $1 AND kind = 'cv' ORDER BY created_at DESC`, [teacherId]);
}

export function documentById(id: string) {
  return one<{ id: string; teacher_id: string; filename: string; mime: string; data: Buffer }>(
    `SELECT id, teacher_id, filename, mime, data FROM teacher_documents WHERE id = $1`, [id]);
}

export const fileSize = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} م.ب` : `${Math.ceil(n / 1024)} ك.ب`);
