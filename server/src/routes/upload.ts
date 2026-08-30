import type { FastifyInstance } from "fastify";
import { Readable } from "node:stream";
import { saveUpload, MAX_UPLOAD_SIZE } from "../services/upload.js";

export async function uploadRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  app.post("/", async (req, reply) => {
    const parts = req.parts();
    let fileResult: Awaited<ReturnType<typeof saveUpload>> | null = null;

    for await (const part of parts) {
      if (part.type === "file") {
        const buffer = await part.toBuffer();
        if (buffer.length > MAX_UPLOAD_SIZE) {
          reply.code(413).send({ error: "File melebihi batas ukuran" });
          return;
        }
        const stream = Readable.from(buffer);
        fileResult = await saveUpload(
          stream,
          part.filename || "file",
          part.mimetype || "application/octet-stream"
        );
        break;
      }
    }

    if (!fileResult) {
      reply.code(400).send({ error: "Tidak ada file yang diupload" });
      return;
    }
    reply.code(201).send(fileResult);
  });
}