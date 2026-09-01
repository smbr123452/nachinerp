import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Файл хадгалалтын давхарга.
 *
 * Аюулгүй байдлын дүрмүүд:
 *   - Хэрэглэгчийн өгсөн файлын нэрийг ЗАМ болгон ХЭЗЭЭ Ч ашиглахгүй.
 *     Түлхүүр нь санамсаргүй UUID + зөвшөөрөгдсөн өргөтгөл.
 *   - Түлхүүрийг үргэлж дахин шалгаж, суурь сангаас гарахыг хориглоно
 *     (path traversal).
 *   - Үндсэн зам нь орчны хувьсагчаас — тодорхой машины зам код дотор
 *     бичигдэхгүй.
 *
 * Одоогийн хэрэгжүүлэлт нь локал диск. Интерфэйс нь S3 гэх мэт алсын
 * хадгалалт руу шилжихэд бэлэн — дуудагч талын код өөрчлөгдөхгүй.
 */

export type StoredFile = {
  storageKey: string;
  fileSize: number;
};

export interface FileStorage {
  put(input: { data: Buffer; mimeType: string }): Promise<StoredFile>;
  get(storageKey: string): Promise<Buffer>;
  delete(storageKey: string): Promise<void>;
}

/** Зөвшөөрөгдсөн төрөл ба тэдгээрийн найдвартай өргөтгөл. */
export const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB

export function isAllowedMimeType(mimeType: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALLOWED_MIME_TYPES, mimeType);
}

/** Түлхүүрийн хэлбэр: "<uuid>.<ext>". Өөр юу ч зөвшөөрөхгүй. */
const KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{1,8}$/;

export function isValidStorageKey(key: string): boolean {
  return KEY_PATTERN.test(key);
}

/**
 * Хадгалалтын үндсэн зам.
 * ATTACHMENT_STORAGE_DIR тохируулаагүй бол ажиллаж буй сангийн доор
 * .storage/attachments. Аль ч тохиолдолд код дотор тодорхой машины
 * зам бичигдээгүй.
 */
function baseDir(): string {
  const configured = process.env.ATTACHMENT_STORAGE_DIR;
  return configured && configured.trim().length > 0
    ? path.resolve(configured)
    : path.resolve(process.cwd(), ".storage", "attachments");
}

/**
 * Түлхүүрээс бодит замыг гаргана. Хэлбэрийг шалгасны дараа ч эцсийн
 * замыг суурь сангийн дотор эсэхийг дахин баталгаажуулна.
 */
function resolveKeyPath(storageKey: string): string {
  if (!isValidStorageKey(storageKey)) {
    throw new Error("Файлын түлхүүр буруу байна.");
  }
  const root = baseDir();
  const target = path.resolve(root, storageKey);
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (!target.startsWith(rootWithSep)) {
    throw new Error("Файлын түлхүүр буруу байна.");
  }
  return target;
}

class LocalFileStorage implements FileStorage {
  async put({ data, mimeType }: { data: Buffer; mimeType: string }): Promise<StoredFile> {
    const extension = ALLOWED_MIME_TYPES[mimeType];
    if (!extension) throw new Error("Энэ төрлийн файл зөвшөөрөгдөөгүй.");
    if (data.byteLength === 0) throw new Error("Файл хоосон байна.");
    if (data.byteLength > MAX_ATTACHMENT_BYTES) throw new Error("Файлын хэмжээ хэтэрсэн байна.");

    // Түлхүүр нь зөвхөн санамсаргүй утга + баталгаажсан өргөтгөлөөс бүрдэнэ.
    // Хэрэглэгчийн өгсөн нэр энд огт оролцохгүй.
    const storageKey = `${randomUUID()}.${extension}`;
    const target = resolveKeyPath(storageKey);

    await mkdir(path.dirname(target), { recursive: true });
    // wx — байгаа файлыг дарж бичихээс сэргийлнэ.
    await writeFile(target, data, { flag: "wx" });

    return { storageKey, fileSize: data.byteLength };
  }

  async get(storageKey: string): Promise<Buffer> {
    return readFile(resolveKeyPath(storageKey));
  }

  async delete(storageKey: string): Promise<void> {
    await unlink(resolveKeyPath(storageKey)).catch((error: NodeJS.ErrnoException) => {
      // Файл аль хэдийн байхгүй бол алдаа биш — бүртгэл нь устах ёстой.
      if (error.code !== "ENOENT") throw error;
    });
  }
}

export const fileStorage: FileStorage = new LocalFileStorage();
