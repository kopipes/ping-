import type { FastifyInstance } from "fastify";
import {
  getVapidPublicKey,
  saveSubscription,
  deleteSubscription,
} from "../services/push.js";

export async function pushRoutes(app: FastifyInstance) {
  // GET /api/push/vapid-public-key — publik, tidak perlu auth
  app.get("/vapid-public-key", async (_req, reply) => {
    try {
      const key = getVapidPublicKey();
      return reply.send({ vapidPublicKey: key });
    } catch {
      return reply.status(503).send({ error: "Push notifications tidak dikonfigurasi" });
    }
  });

  // POST /api/push/subscribe — simpan subscription baru
  app.post(
    "/subscribe",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = (req.user as any).id as string;
      const body = req.body as any;

      const endpoint: string = body?.endpoint;
      const p256dh: string = body?.keys?.p256dh;
      const auth: string = body?.keys?.auth;

      if (!endpoint || !p256dh || !auth) {
        return reply.status(400).send({ error: "Endpoint, p256dh, dan auth wajib diisi" });
      }

      await saveSubscription({ userId, endpoint, p256dh, auth });
      return reply.status(201).send({ ok: true });
    }
  );

  // DELETE /api/push/unsubscribe — hapus subscription
  app.delete(
    "/unsubscribe",
    { onRequest: [app.authenticate] },
    async (req, reply) => {
      const userId = (req.user as any).id as string;
      const body = req.body as any;
      const endpoint: string = body?.endpoint;

      if (!endpoint) {
        return reply.status(400).send({ error: "Endpoint wajib diisi" });
      }

      await deleteSubscription(endpoint, userId);
      return reply.status(204).send();
    }
  );
}
