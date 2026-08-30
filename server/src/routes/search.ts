import type { FastifyInstance } from "fastify";
import { searchContent } from "../services/search.js";
import { prisma } from "../lib/prisma.js";

export async function searchRoutes(app: FastifyInstance) {
  app.addHook("preHandler", app.authenticate);

  // FR-9.2 General Search (global & in-conversation), dikelompokkan per kategori
  app.get("/", async (req, reply) => {
    const query = req.query as {
      q?: string;
      scope?: string;
      type?: string;
      conversationId?: string;
      limit?: string;
    };
    const q = (query.q ?? "").trim();
    if (!q) {
      reply.code(400).send({ error: "query kata kunci wajib diisi" });
      return;
    }

    const scope = query.scope === "conversation" ? "conversation" : "global";
    const type = ["message", "file", "link"].includes(query.type || "")
      ? (query.type as "message" | "file" | "link")
      : undefined;

    // FR-9.0 quick-filter topic/DM by name untuk sidebar search
    const topicHits =
      scope === "global"
        ? await prisma.conversationMember.findMany({
            where: {
              userId: req.user.id,
              conversation: {
                isArchived: false,
                OR: [{ name: { contains: q } }],
              },
            },
            include: {
              conversation: {
                select: { id: true, name: true, icon: true, type: true, isPinnedTop: true, parentId: true },
              },
            },
            take: 10,
          })
        : [];

    const content = await searchContent({
      q,
      scope,
      type,
      conversationId: query.conversationId,
      viewerId: req.user.id,
      limit: Number(query.limit) || 20,
    });

    const topicResults = topicHits.map((t) => t.conversation);

    return {
      topics: topicResults,
      ...content,
    };
  });
}