import { create } from "zustand";
import { api, apiUrl } from "../lib/api";
import { useAuthStore } from "./auth";
import {
  socketSend,
  isSocketConnected,
  markRead,
  joinConversation,
  emitTyping,
  emitReaction,
} from "../lib/socket";
import type {
  SidebarData,
  SidebarItem,
  Message,
  Conversation,
  Permissions,
  PinnedItem,
  LibraryItem,
  SearchResponse,
} from "../types";

type SidebarDataItem = SidebarItem;
type LibFilter = "ALL" | "IMAGE" | "FILE" | "LINK";

interface ChatStore {
  sidebar: SidebarData | null;
  sidebarLoading: boolean;
  activeId: string | null;
  messages: Record<string, Message[]>;
  messagesLoading: Record<string, boolean>;
  // prevCursor per conversation — null means no more older messages
  prevCursor: Record<string, string | null>;
  loadingMore: Record<string, boolean>;
  conversation: Record<string, Conversation>;
  permissions: Record<string, Permissions>;
  pinned: Record<string, PinnedItem[]>;
  library: Record<string, LibraryItem[]>;
  typing: Record<string, { userId: string; userName: string }[]>;
  // readAt[conversationId][userId] = ISO timestamp of last read
  readAt: Record<string, Record<string, string>>;
  searchActive: boolean;
  searchQuery: string;
  searchResult: SearchResponse | null;
  searchLoading: boolean;

  loadSidebar: () => Promise<void>;
  openConversation: (id: string) => Promise<void>;
  loadMoreMessages: (conversationId: string) => Promise<void>;
  sendMessage: (conversationId: string, content: string | undefined, attachments?: any[], parentId?: string | null) => void;
  editMessage: (conversationId: string, messageId: string, content: string) => Promise<void>;
  deleteMessage: (conversationId: string, messageId: string) => Promise<void>;
  receiveMessage: (m: Message) => void;
  receiveEdited: (conversationId: string, m: Message) => void;
  receiveRemoved: (conversationId: string, messageId: string) => void;
  search: (q: string, scope?: "global" | "conversation") => Promise<void>;
  loadPinned: (conversationId: string) => Promise<void>;
  loadLibrary: (conversationId: string, type?: LibFilter) => Promise<void>;
  toggleReaction: (conversationId: string, messageId: string, emoji: string) => void;
  toggleTyping: (conversationId: string, userId: string, typing: boolean, userName?: string) => void;
  markReadCurrent: () => void;
  markConversationRead: (conversationId: string, userId: string, at: string) => void;
  setSearchActive: (active: boolean) => void;
  presence: Record<string, string>; // userId -> "online" | "offline"
  setPresence: (userId: string, status: string) => void;
  reset: () => void;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sidebar: null,
  sidebarLoading: false,
  activeId: null,
  messages: {},
  messagesLoading: {},
  prevCursor: {},
  loadingMore: {},
  conversation: {},
  permissions: {},
  pinned: {},
  library: {},
  typing: {},
  readAt: {},
  presence: {},
  searchActive: false,
  searchQuery: "",
  searchResult: null,
  searchLoading: false,

  loadSidebar: async () => {
    set({ sidebarLoading: true });
    try {
      const data = await api<SidebarData>("/api/conversations");
      set({ sidebar: data, sidebarLoading: false });
      // Join all rooms NOW that sidebar is loaded — socket may already
      // be connected at this point, so join here too (not just on connect)
      const allIds: string[] = [];
      if (data.pinnedTop) data.pinnedTop.forEach((c) => c.id && allIds.push(c.id));
      if (data.level1) data.level1.forEach((c) => {
        if (c.id) allIds.push(c.id);
        if (c.subTopics) c.subTopics.forEach((s) => s.id && allIds.push(s.id));
      });
      if (data.dms) data.dms.forEach((c) => c.id && allIds.push(c.id));
      allIds.forEach((id) => joinConversation(id));
      // Fetch initial presence for DM partners
      api<Record<string, string>>("/api/users/presence").then((presenceMap) => {
        set({ presence: presenceMap });
      }).catch(() => {});
    } catch {
      set({ sidebarLoading: false });
    }
  },

  openConversation: async (id) => {
    // aktifkan percakapan segera; jangan reset pesan lama utk menghindari flash
    set((s) => {
      // Zero out unread count for this conversation in sidebar immediately
      let sidebar = s.sidebar;
      if (sidebar) {
        const zero = (items: SidebarDataItem[] | undefined): SidebarDataItem[] =>
          (items || []).map((it) =>
            it.id === id
              ? { ...it, unread: 0 }
              : { ...it, subTopics: it.subTopics ? zero(it.subTopics) : it.subTopics }
          );
        sidebar = {
          ...sidebar,
          pinnedTop: zero(sidebar.pinnedTop),
          level1: zero(sidebar.level1),
          dms: zero(sidebar.dms),
        };
      }
      return { activeId: id, sidebar };
    });

    joinConversation(id);
    markRead(id);

    // cache: kalau sudah pernah dibuka, langsung tampilkan tanpa menunggu network
    if (get().messages[id]) {
      set((s) => ({ messagesLoading: { ...s.messagesLoading, [id]: false } }));
    } else {
      set((s) => ({ messagesLoading: { ...s.messagesLoading, [id]: true } }));
      api<{ messages: Message[]; prevCursor: string | null }>(`/api/conversations/${id}/messages?limit=50`)
        .then((res) => {
          set((s) => ({
            messages: { ...s.messages, [id]: res.messages },
            messagesLoading: { ...s.messagesLoading, [id]: false },
            prevCursor: { ...s.prevCursor, [id]: res.prevCursor },
          }));
        })
        .catch(() => {
          set((s) => ({ messagesLoading: { ...s.messagesLoading, [id]: false } }));
        });
    }

    // 2) metadata & permission berjalan paralel, tidak memblokir daftar pesan
    if (!get().conversation[id]) {
      api<Conversation>(`/api/conversations/${id}`)
        .then((convo) => set((s) => ({ conversation: { ...s.conversation, [id]: convo } })))
        .catch(() => {});
    }
    // Always re-fetch permissions — they can change (e.g. canDeleteDM after partner is deleted)
    api<Permissions>(`/api/conversations/${id}/permissions`)
      .then((perms) => set((s) => ({ permissions: { ...s.permissions, [id]: perms } })))
      .catch(() => {});
  },

  loadMoreMessages: async (conversationId) => {
    const cursor = get().prevCursor[conversationId];
    if (!cursor || get().loadingMore[conversationId]) return;
    set((s) => ({ loadingMore: { ...s.loadingMore, [conversationId]: true } }));
    try {
      const res = await api<{ messages: Message[]; prevCursor: string | null }>(
        `/api/conversations/${conversationId}/messages?limit=30&cursor=${cursor}`
      );
      set((s) => ({
        messages: {
          ...s.messages,
          [conversationId]: [...res.messages, ...(s.messages[conversationId] || [])],
        },
        prevCursor: { ...s.prevCursor, [conversationId]: res.prevCursor },
        loadingMore: { ...s.loadingMore, [conversationId]: false },
      }));
    } catch {
      set((s) => ({ loadingMore: { ...s.loadingMore, [conversationId]: false } }));
    }
  },

  sendMessage: (conversationId, content, attachments = [], parentId = null) => {
    if ((!content || !content.trim()) && attachments.length === 0) return;

    // Optimistic UI: tampilkan pesan instan ber-status "sending", lalu reconcile saat server broadcast kembali
    const user = useAuthStore.getState().user;
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: Message = {
      id: tempId,
      conversationId,
      parentId: parentId ?? null,
      content: content || null,
      isEdited: false,
      isDeleted: false,
      createdAt: new Date().toISOString(),
      userId: user?.id ?? "",
      user: { id: user?.id ?? "", name: user?.name ?? "", avatarUrl: user?.avatarUrl ?? null },
      attachments: (attachments || []).map((a: any, i) => ({
        id: `tmpAtt-${tempId}-${i}`,
        messageId: tempId,
        type: a.type,
        fileUrl: a.fileUrl,
        thumbnailUrl: a.thumbnailUrl ?? null,
        fileName: a.fileName ?? null,
        fileSize: a.fileSize ?? null,
        linkMetadata: a.linkMetadata ?? null,
      })),
      reactions: [],
      replyCount: 0,
      status: "sending",
    };

    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: [...(s.messages[conversationId] || []), optimistic],
      },
    }));

    socketSend("message:send", {
      conversationId,
      content: content || undefined,
      attachments,
      parentId,
    });

    // Fallback REST jika socket tidak connected dalam 2 detik
    // ini memastikan pesan selalu terkirim walau socket lambat/belum connect
    setTimeout(() => {
      const list = get().messages[conversationId] || [];
      const stillSending = list.some((m) => m.id === tempId && m.status === "sending");
      if (stillSending) {
        // socket belum deliver → kirim via REST
        api<Message>(`/api/conversations/${conversationId}/messages`, {
          method: "POST",
          body: {
            content: content || undefined,
            parentId: parentId ?? null,
            attachments: attachments,
          },
        })
          .then((msg) => {
            set((s) => ({
              messages: {
                ...s.messages,
                [conversationId]: (s.messages[conversationId] || []).map((m) =>
                  m.id === tempId ? { ...msg, status: "sent" } : m
                ),
              },
            }));
          })
          .catch(() => {
            // mark failed
            set((s) => ({
              messages: {
                ...s.messages,
                [conversationId]: (s.messages[conversationId] || []).map((m) =>
                  m.id === tempId ? { ...m, status: "failed" } : m
                ),
              },
            }));
          });
      }
    }, 2000);
  },

  editMessage: async (conversationId, messageId, content) => {
    const m = await api<Message>(`/api/messages/${messageId}`, {
      method: "PATCH",
      body: { content },
    });
    get().receiveEdited(conversationId, m);
  },

  deleteMessage: async (conversationId, messageId) => {
    await api(`/api/messages/${messageId}`, { method: "DELETE" });
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] || []).map((m) =>
          m.id === messageId ? { ...m, isDeleted: true } : m
        ),
      },
    }));
  },

  receiveMessage: (m) => {
    set((s) => {
      const list = s.messages[m.conversationId] || [];
      // reconcile optimistic temp: ganti temp "sending" milik sender yang paling awal
      const pendingIdx = list.findIndex(
        (x) =>
          x.status === "sending" &&
          x.id.startsWith("temp-") &&
          x.userId === m.userId &&
          (x.content === m.content || (x.content === null && m.content === null))
      );
      if (pendingIdx >= 0) {
        const next = [...list];
        next[pendingIdx] = { ...m, status: "sent" };
        return { messages: { ...s.messages, [m.conversationId]: next } };
      }
      const exists = list.some((x) => x.id === m.id);
      const messages = {
        ...s.messages,
        [m.conversationId]: exists ? list.map((x) => (x.id === m.id ? m : x)) : [...list, m],
      };
      // update unread di sidebar utk conversation bukan aktif
      let sidebar = s.sidebar;
      if (sidebar && m.conversationId !== s.activeId) {
        const bump = (items: SidebarDataItem[] | undefined): SidebarDataItem[] =>
          (items || []).map((it) =>
            ilConv(it, m.conversationId)
              ? { ...it, unread: (it.unread || 0) + 1 }
              : {
                  ...it,
                  subTopics: it.subTopics ? bump(it.subTopics) : it.subTopics,
                }
          );
        sidebar = {
          ...sidebar,
          pinnedTop: bump(sidebar.pinnedTop),
          level1: bump(sidebar.level1),
          dms: bump(sidebar.dms),
        };
      }
      return { messages, sidebar };
    });
  },

  receiveEdited: (conversationId, m) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] || []).map((x) =>
          x.id === m.id ? { ...x, content: m.content, isEdited: true } : x
        ),
      },
    }));
  },

  receiveRemoved: (conversationId, messageId) => {
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] || []).map((m) =>
          m.id === messageId ? { ...m, isDeleted: true } : m
        ),
      },
    }));
  },

  search: async (q, scope = "global") => {
    const trimmed = q.trim();
    if (!trimmed) {
      set({ searchResult: null });
      return;
    }
    set({ searchLoading: true, searchQuery: trimmed });
    try {
      const params = new URLSearchParams();
      params.set("q", trimmed);
      params.set("scope", scope);
      if (scope === "conversation" && get().activeId) {
        params.set("conversationId", get().activeId!);
      }
      const data = await api<SearchResponse>(`/api/search?${params.toString()}`);
      set({ searchResult: data, searchLoading: false });
    } catch {
      set({ searchLoading: false });
    }
  },

  loadPinned: async (conversationId) => {
    try {
      const data = await api<PinnedItem[]>(`/api/conversations/${conversationId}/pinned`);
      set((s) => ({ pinned: { ...s.pinned, [conversationId]: data } }));
    } catch {
      /* ignore */
    }
  },

  loadLibrary: async (conversationId, type = "ALL") => {
    try {
      const q = type && type !== "ALL" ? `?type=${type}` : "";
      const data = await api<LibraryItem[]>(`/api/conversations/${conversationId}/library${q}`);
      set((s) => ({ library: { ...s.library, [conversationId]: data } }));
    } catch {
      /* ignore */
    }
  },

  toggleReaction: (conversationId, messageId, emoji) => {
    const myId = useAuthStore.getState().user?.id;
    if (!myId) return;
    const msgs = get().messages[conversationId] || [];
    const msg = msgs.find((m) => m.id === messageId);
    const has = !!msg?.reactions.some((r) => r.userId === myId && r.emoji === emoji);
    emitReaction(has ? "remove" : "add", messageId, emoji);
    set((s) => ({
      messages: {
        ...s.messages,
        [conversationId]: (s.messages[conversationId] || []).map((m) =>
          m.id === messageId
            ? {
                ...m,
                reactions: has
                  ? m.reactions.filter((r) => !(r.userId === myId && r.emoji === emoji))
                  : [...m.reactions, { userId: myId, emoji }],
              }
            : m
        ),
      },
    }));
  },

  toggleTyping: (conversationId, userId, typing, userName) => {
    set((s) => {
      const current = s.typing[conversationId] || [];
      let updated: { userId: string; userName: string }[];
      if (typing) {
        const exists = current.some((t) => t.userId === userId);
        updated = exists ? current : [...current, { userId, userName: userName ?? userId }];
      } else {
        updated = current.filter((t) => t.userId !== userId);
      }
      return { typing: { ...s.typing, [conversationId]: updated } };
    });
  },

  markReadCurrent: () => {
    if (get().activeId) markRead(get().activeId!);
  },

  markConversationRead: (conversationId, userId, at) => {
    set((s) => ({
      readAt: {
        ...s.readAt,
        [conversationId]: {
          ...(s.readAt[conversationId] || {}),
          [userId]: at,
        },
      },
    }));
  },

  setSearchActive: (active) => set({ searchActive: active }),

  setPresence: (userId, status) => set((s) => ({ presence: { ...s.presence, [userId]: status } })),

  reset: () =>
    set({
      sidebar: null,
      activeId: null,
      messages: {},
      conversation: {},
      permissions: {},
      pinned: {},
      library: {},
      typing: {},
      readAt: {},
      searchResult: null,
    }),
}));

function ilConv(item: any, id: string) {
  return item && item.id === id;
}

export const assetUrl = (url: string) => apiUrl(url);