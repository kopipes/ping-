import fs from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import sharp from "sharp";
import { pipeline } from "node:stream/promises";

export const MAX_UPLOAD_SIZE = (Number(process.env.MAX_UPLOAD_SIZE_MB) || 25) * 1024 * 1024;
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || "./uploads");

await ensureUploadDir();

async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.mkdir(path.join(UPLOAD_DIR, "thumbs"), { recursive: true });
}

const IMAGE_EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".gif"]);

export async function saveUpload(
  stream: NodeJS.ReadableStream,
  originalName: string,
  mime: string
) {
  const ext = path.extname(originalName || "file").toLowerCase() || ".bin";
  const id = crypto.randomUUID();
  const relative = path.join("chats", id) + ext;
  const absPath = path.join(UPLOAD_DIR, relative);
  await fs.mkdir(path.dirname(absPath), { recursive: true });

  const isImage = IMAGE_EXT.has(ext) || mime.startsWith("image/");

  const writeStream = createWriteStream(absPath);
  await pipeline(stream as any, writeStream);
  const stat = await fs.stat(absPath);
  const size = stat.size;
  const fileUrl = `/files/${relative}`;

  let thumbnailUrl: string | null = null;
  if (isImage && ext !== ".gif") {
    try {
      const thumbRelative = path.join("thumbs", id) + ".webp";
      const thumbAbs = path.join(UPLOAD_DIR, thumbRelative);
      await sharp(absPath)
        .resize({ width: 300, withoutEnlargement: true })
        .webp({ quality: 70 })
        .toFile(thumbAbs);
      thumbnailUrl = `/files/${thumbRelative}`;
    } catch {
      thumbnailUrl = null;
    }
  }

  return {
    type: isImage ? "IMAGE" : "FILE",
    fileUrl,
    thumbnailUrl,
    fileName: originalName,
    fileSize: size,
    mime,
  };
}