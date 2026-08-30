import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import staticPlugin from "@fastify/static";
import jwt from "@fastify/jwt";
import multipart from "@fastify/multipart";
import { Server } from "socket.io";
import { schedule } from "node-cron";
import { setupSocket } from "./plugins/socket.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { conversationRoutes } from "./routes/conversations.js";
import { messageRoutes } from "./routes/messages.js";
import { uploadRoutes } from "./routes/upload.js";
import { searchRoutes } from "./routes/search.js";
import { adminRoutes } from "./routes/admin.js";
import { linkPreviewRoutes } from "./routes/linkPreview.js";
import { pushRoutes } from "./routes/push.js";
import { webhookRoutes } from "./routes/webhook.js";
import { authenticate } from "./plugins/auth.js";
import { prisma } from "./lib/prisma.js";
import { UPLOAD_DIR } from "./services/upload.js";
import { getRetentionSettings, runArchive } from "./services/admin.js";

const app = Fastify({
  logger: {
    transport: undefined,
    level: "info",
  },
});

await app.register(cors, {
  origin: process.env.CORS_ORIGIN?.split(",") ?? true,
  credentials: true,
});

await app.register(jwt, {
  secret: process.env.JWT_SECRET || "dev-secret",
});

await app.register(multipart, {
  limits: {
    fileSize: (Number(process.env.MAX_UPLOAD_SIZE_MB) || 25) * 1024 * 1024,
  },
});

await app.register(cookie);

// Serve uploaded files (FR-6.x)
await app.register(staticPlugin, {
  root: UPLOAD_DIR,
  prefix: "/files/",
});

// Dekorator autentikasi & permission
app.decorate("authenticate", authenticate);

// Health check
app.get("/health", async () => ({ status: "ok" }));

// Routes
await app.register(authRoutes, { prefix: "/api/auth" });
await app.register(userRoutes, { prefix: "/api/users" });
await app.register(conversationRoutes, { prefix: "/api/conversations" });
await app.register(messageRoutes, { prefix: "/api/messages" });
await app.register(uploadRoutes, { prefix: "/api/upload" });
await app.register(searchRoutes, { prefix: "/api/search" });
await app.register(adminRoutes, { prefix: "/api/admin" });
await app.register(linkPreviewRoutes, { prefix: "/api/link-preview" });
await app.register(pushRoutes, { prefix: "/api/push" });
await app.register(webhookRoutes, { prefix: "/api/webhook" });

// Socket.IO
const io = new Server(app.server, {
  cors: {
    origin: process.env.CORS_ORIGIN?.split(",") ?? true,
    credentials: true,
  },
});
setupSocket(io);
app.decorate("io", io);

// Auto-archive cron — runs daily at 02:00, only when policy is auto-archive
schedule("0 2 * * *", async () => {
  try {
    const policy = await getRetentionSettings();
    if (policy.mode !== "auto-archive") return;
    const result = await runArchive("system");
    app.log.info(`[cron] auto-archive: ${result.archived} messages archived`);
  } catch (err) {
    app.log.error({ err }, "[cron] auto-archive failed");
  }
});

// Graceful shutdown
const close = async () => {
  await app.close();
  await prisma.$disconnect();
  process.exit(0);
};
process.on("SIGINT", close);
process.on("SIGTERM", close);

const port = Number(process.env.PORT) || 4000;
app.listen({ port, host: "0.0.0.0" }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Ping! server running on http://localhost:${port}`);
});