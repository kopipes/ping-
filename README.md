# Ping! — Internal Company Chat App

A real-time internal chat application built for teams. Features group topics, direct messages, file sharing, push notifications, and a full admin panel.

---

## Tech Stack

**Backend** — `server/`
- [Fastify v4](https://fastify.dev/) + TypeScript
- [Prisma v5](https://www.prisma.io/) with SQLite
- [Socket.IO v4](https://socket.io/) for real-time messaging
- JWT authentication (access + httpOnly refresh cookie)
- [web-push](https://github.com/web-push-libs/web-push) for Web Push notifications (VAPID)
- [sharp](https://sharp.pixelplumbing.com/) for image thumbnails
- [node-cron](https://github.com/kelektiv/node-cron) for scheduled tasks
- [open-graph-scraper](https://github.com/jshemas/openGraphScraper) for link previews
- [argon2](https://github.com/ranisalt/node-argon2) for password hashing

**Frontend** — `client/`
- [React 18](https://react.dev/) + TypeScript
- [Vite 5](https://vitejs.dev/) + [vite-plugin-pwa](https://vite-pwa-org.netlify.app/) (PWA / installable)
- [Tailwind CSS 3](https://tailwindcss.com/) — navy theme
- [Zustand](https://zustand-demo.pmnd.rs/) for state management
- [i18next](https://www.i18next.com/) — Indonesian (`id`) and English (`en`)
- [socket.io-client](https://socket.io/docs/v4/client-api/)
- [browser-image-compression](https://github.com/Donaldcwl/browser-image-compression)

---

## Features

### Messaging
- Real-time messages via Socket.IO
- Optimistic send with REST fallback
- Edit messages (configurable time window, default 15 min)
- Delete messages (own: anytime; others: admin only)
- Reply with quote block
- Forward messages to other conversations
- Reactions (emoji)
- File & image attachments with thumbnails
- Link preview auto-unfurl (Open Graph)

### Conversations
- **Topics** — 2-level hierarchy (group → sub-group)
- **Direct Messages**
- Star/unstar topics (admin)
- Read-only mode (Announcement channel)
- Pinned messages & file library per conversation

### Notifications
- Real-time typing indicators (shows user name)
- **Web Push notifications** — offline members notified on new messages
  - Toggle in Profile settings
  - Powered by VAPID + service worker
  - Works on desktop and Android Chrome
  - iOS 16.4+ requires PWA install + HTTPS

### Authentication & Users
- JWT access token (15 min) + httpOnly refresh cookie (7 days)
- Self-registration with admin approval flow
- Roles: `SUPER_ADMIN` > `ADMIN` > `MANAGER` > `STAFF`
- Online/offline/away status
- Avatar upload, name, division, language, font size, chat background

### Admin Panel
- Dashboard stats
- User management (invite, edit, reset password, role, status, delete)
- Pending registration approvals
- Topic management
- Divisions master data
- Audit log
- Data retention settings + auto-archive cron (daily 02:00)
- Message edit window setting

### PWA
- Installable on desktop and mobile
- Workbox offline caching
- Service worker push handler + `notificationclick` navigation

---

## Project Structure

```
ping/
├── client/                  # React + Vite frontend
│   ├── public/
│   │   ├── icon.svg
│   │   └── sw-push.js       # Push notification service worker
│   ├── src/
│   │   ├── components/      # UI components
│   │   ├── lib/
│   │   │   ├── api.ts       # Fetch wrapper with auto token refresh
│   │   │   ├── push.ts      # Web Push client helpers
│   │   │   └── socket.ts    # Socket.IO client
│   │   ├── store/           # Zustand stores (auth, chat, ui)
│   │   ├── pages/           # Login page
│   │   ├── i18n/            # id.ts + en.ts translations
│   │   └── main.tsx
│   ├── vite.config.ts
│   └── tailwind.config.js
│
├── server/                  # Fastify backend
│   ├── prisma/
│   │   ├── schema.prisma    # DB schema
│   │   ├── migrations/      # Prisma migrations
│   │   └── seed.ts          # Demo seed data
│   └── src/
│       ├── index.ts         # App entry, routes, cron
│       ├── plugins/
│       │   ├── auth.ts      # JWT authenticate decorator
│       │   └── socket.ts    # Socket.IO setup
│       ├── routes/          # Fastify route handlers
│       │   ├── auth.ts
│       │   ├── users.ts
│       │   ├── conversations.ts
│       │   ├── messages.ts
│       │   ├── upload.ts
│       │   ├── search.ts
│       │   ├── admin.ts
│       │   ├── push.ts      # Push subscription endpoints
│       │   └── linkPreview.ts
│       └── services/        # Business logic
│           ├── push.ts      # VAPID + sendPushToUser()
│           └── ...
│
├── package.json             # pnpm workspace root
├── pnpm-workspace.yaml
└── .gitignore
```

---

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 8+

### Install dependencies

```bash
pnpm install
```

### Configure environment

Copy and edit the server environment file:

```bash
cp server/.env.example server/.env
```

Key variables in `server/.env`:

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me-in-production"

PORT=4000
CORS_ORIGIN="http://localhost:5173"

# Web Push (VAPID) — generate with: node -e "const wp=require('web-push');console.log(wp.generateVAPIDKeys())"
VAPID_PUBLIC_KEY=""
VAPID_PRIVATE_KEY=""
VAPID_SUBJECT="mailto:admin@example.com"
```

> The repo ships with pre-generated VAPID keys for local development. Generate new ones for production.

### Set up the database

```bash
pnpm --filter ./server exec prisma migrate deploy
pnpm --filter ./server run seed
```

### Run in development

```bash
# Terminal 1 — server (port 4000)
cd server && pnpm run dev

# Terminal 2 — client (port 5173)
cd client && pnpm run dev
```

App is at **http://localhost:5173**

---

## Demo Accounts

| Email | Password | Role |
|---|---|---|
| `admin@pvc.local` | `admin123` | SUPER_ADMIN |
| `sari@pvc.local` | `sari123` | STAFF |

---

## API Overview

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/auth/login` | Login, sets refresh cookie |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `POST` | `/api/auth/logout` | Logout |
| `POST` | `/api/auth/register` | Register (pending approval) |
| `GET` | `/api/users/me` | Current user profile |
| `PATCH` | `/api/users/me` | Update name/division |
| `GET` | `/api/conversations` | Sidebar list |
| `GET` | `/api/conversations/:id/messages` | Message history |
| `GET` | `/api/search` | Global search |
| `GET` | `/api/push/vapid-public-key` | VAPID public key |
| `POST` | `/api/push/subscribe` | Register push subscription |
| `DELETE` | `/api/push/unsubscribe` | Remove push subscription |
| `GET` | `/api/admin/dashboard` | Admin stats |
| `GET` | `/api/link-preview` | OG link preview |

---

## Push Notifications

Web Push is fully implemented. To test:

1. Open the app in a browser that supports Push (Chrome, Edge, Firefox)
2. Go to **Profile → Notifications** and toggle on
3. Send a message from another account while the first is offline/away

**Local HTTPS for Android testing** — Push requires HTTPS on Android. Use [ngrok](https://ngrok.com/):

```bash
ngrok http 5173
```

Then update `CORS_ORIGIN` in `server/.env` to the ngrok URL.

**iOS** — requires iOS 16.4+, HTTPS, and the app installed as a PWA (Add to Home Screen).

---

## Database Schema

| Model | Description |
|---|---|
| `User` | App users with role, status, locale |
| `Conversation` | Topics (2-level) and DMs |
| `ConversationMember` | Membership, mute settings |
| `Message` | Messages with edit/delete/forward/reply |
| `Attachment` | Files and images attached to messages |
| `PinnedItem` | Pinned messages per conversation |
| `Reaction` | Emoji reactions on messages |
| `PushSubscription` | Web Push device subscriptions |
| `AuditLog` | Admin action log |

---

## Production Deployment

1. Build the client: `pnpm --filter ./client run build` — output in `client/dist/`
2. Serve `client/dist/` via nginx or any static host (HTTPS required for PWA push)
3. Run the server with a process manager: `pnpm --filter ./server run start`
4. Set all env vars — especially `JWT_SECRET`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `CORS_ORIGIN`
5. Run `prisma migrate deploy` on first deploy

---

## License

MIT
