import type { FastifyInstance } from "fastify";
import { fetchLinkPreview } from "../services/linkPreview.js";

export async function linkPreviewRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // GET /api/link-preview?url=https://...
  app.get("/", async (req, reply) => {
    const { url } = req.query as { url?: string };
    if (!url) {
      reply.code(400).send({ error: "url diperlukan" });
      return;
    }
    try {
      new URL(url); // validate URL format
    } catch {
      reply.code(400).send({ error: "url tidak valid" });
      return;
    }
    const preview = await fetchLinkPreview(url);
    return preview;
  });
}
