import { useEffect } from "react";
import { useAuthStore } from "./store/auth";
import { useChatStore } from "./store/chat";
import { on, joinConversation } from "./lib/socket";
import { Login } from "./pages/Login";
import { Layout } from "./components/Layout";
import type { Message } from "./types";

export default function App() {
  const boot = useAuthStore((s) => s.boot);
  const loading = useAuthStore((s) => s.loading);
  const user = useAuthStore((s) => s.user);

  const loadSidebar = useChatStore((s) => s.loadSidebar);
  const receiveMessage = useChatStore((s) => s.receiveMessage);
  const receiveEdited = useChatStore((s) => s.receiveEdited);
  const receiveRemoved = useChatStore((s) => s.receiveRemoved);
  const loadPinned = useChatStore((s) => s.loadPinned);
  const toggleTyping = useChatStore((s) => s.toggleTyping);
  const toggleReaction = useChatStore((s) => s.toggleReaction);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    if (user) {
      loadSidebar();
      // Guard against flooding loadSidebar for unknown conversations.
      // Tracks CIDs currently being reloaded so we don't fire multiple parallel requests.
      const pendingReload = new Set<string>();

      const offMessage = on("message:new", (payload: { message: Message }) => {
        const { sidebar } = useChatStore.getState();
        const cid = payload.message.conversationId;

        // Build known-ID set from current sidebar
        const knownIds = new Set<string>();
        if (sidebar) {
          sidebar.pinnedTop?.forEach((c) => knownIds.add(c.id));
          sidebar.level1?.forEach((c) => {
            knownIds.add(c.id);
            c.subTopics?.forEach((s) => knownIds.add(s.id));
          });
          sidebar.dms?.forEach((c) => knownIds.add(c.id));
        }

        if (!knownIds.has(cid)) {
          // Unknown conversation (e.g. new incoming DM).
          // Guard: skip if a reload for this cid is already in flight.
          if (!pendingReload.has(cid)) {
            pendingReload.add(cid);
            useChatStore.getState().loadSidebar().then(() => {
              // Only join & show the message if the conversation now exists in sidebar
              // (confirms membership — discards events for rooms we're not in).
              const refreshed = useChatStore.getState().sidebar;
              const confirmedIds = new Set<string>();
              if (refreshed) {
                refreshed.pinnedTop?.forEach((c) => confirmedIds.add(c.id));
                refreshed.level1?.forEach((c) => {
                  confirmedIds.add(c.id);
                  c.subTopics?.forEach((s) => confirmedIds.add(s.id));
                });
                refreshed.dms?.forEach((c) => confirmedIds.add(c.id));
              }
              if (confirmedIds.has(cid)) {
                joinConversation(cid);
                receiveMessage(payload.message);
              }
              pendingReload.delete(cid);
            }).catch(() => pendingReload.delete(cid));
          }
          // Don't call receiveMessage here — wait for sidebar confirmation above
          return;
        }

        receiveMessage(payload.message);
      });
      const offEdited = on("message:edited", (payload: { conversationId: string; message: Message }) =>
        receiveEdited(payload.conversationId, payload.message)
      );
      const offRemoved = on("message:removed", (payload: { conversationId: string; messageId: string; isDeleted: boolean }) => {
        if (payload.isDeleted) receiveRemoved(payload.conversationId, payload.messageId);
      });
      const offTyping = on("typing:start", (p: { conversationId: string; userId: string; userName?: string }) =>
        toggleTyping(p.conversationId, p.userId, true, p.userName)
      );
      const offTypingStop = on("typing:stop", (p: { conversationId: string; userId: string }) =>
        toggleTyping(p.conversationId, p.userId, false)
      );
      const offPinned = on("pinned:added", (p: { conversationId: string }) => loadPinned(p.conversationId));
      const offReaction = on("reaction:added", (p: { messageId: string; userId: string; emoji: string }) =>
        applyReaction(p.messageId, p.userId, p.emoji, true)
      );
      const offReactionRemove = on("reaction:removed", (p: { messageId: string; userId: string; emoji: string }) =>
        applyReaction(p.messageId, p.userId, p.emoji, false)
      );
      // update local user status to online when socket connects
      const offConnected = on("socket:connected", () => {
        const cur = useAuthStore.getState().user;
        if (cur) useAuthStore.getState().setUser({ ...cur, status: "online" });
        // Re-join all rooms on every connect (initial + reconnect).
        // Server drops room membership on disconnect so this must run every time.
        // Filter out undefined/falsy ids — sidebar may not be loaded yet on first connect.
        const { sidebar, activeId, messages } = useChatStore.getState();
        const roomIds = new Set<string>();
        if (activeId) roomIds.add(activeId);
        Object.keys(messages).forEach((id) => id && roomIds.add(id));
        if (sidebar) {
          sidebar.pinnedTop?.forEach((c) => c.id && roomIds.add(c.id));
          sidebar.level1?.forEach((c) => {
            if (c.id) roomIds.add(c.id);
            c.subTopics?.forEach((s) => s.id && roomIds.add(s.id));
          });
          sidebar.dms?.forEach((c) => c.id && roomIds.add(c.id));
        }
        roomIds.forEach((id) => joinConversation(id));
      });
      // socket:reconnected kept for backwards compat but now a no-op
      const offReconnected = on("socket:reconnected", () => {});

      // Track when the DM partner reads messages (read:updated from server)
      const offReadUpdated = on("read:updated", (p: { conversationId: string; userId: string; at: string }) => {
        useChatStore.getState().markConversationRead(p.conversationId, p.userId, p.at);
      });

      // Track online/offline presence
      const offPresence = on("presence:update", (p: { userId: string; status: string }) => {
        useChatStore.getState().setPresence(p.userId, p.status);
      });

      // Track task events
      const offTaskCreated = on("task:created", (p: { task: any }) => {
        useChatStore.getState().receiveTask(p.task);
      });
      const offTaskDone = on("task:done", (p: { task: any }) => {
        useChatStore.getState().receiveTask(p.task);
      });
      const offTaskDeleted = on("task:deleted", (p: { taskId: string }) => {
        const { activeId } = useChatStore.getState();
        if (activeId) useChatStore.getState().removeTask(activeId, p.taskId);
      });

      // Update replyCount on root message when a thread reply arrives or is deleted
      const offThreadCount = on("thread:count", (p: { messageId: string; replyCount: number; replyUsers?: { name: string }[] }) => {
        useChatStore.setState((s) => {
          const nextMessages: typeof s.messages = {};
          for (const cid of Object.keys(s.messages)) {
            const list = s.messages[cid];
            if (list.some((m) => m.id === p.messageId)) {
              nextMessages[cid] = list.map((m) => m.id === p.messageId
                ? { ...m, replyCount: p.replyCount, replyUsers: p.replyUsers ?? m.replyUsers }
                : m
              );
            } else {
              nextMessages[cid] = list;
            }
          }
          return { messages: nextMessages };
        });
      });

      return () => {
        offMessage();
        offEdited();
        offRemoved();
        offTyping();
        offTypingStop();
        offPinned();
        offReaction();
        offReactionRemove();
        offConnected();
        offReconnected();
        offReadUpdated();
        offPresence();
        offTaskCreated();
        offTaskDone();
        offTaskDeleted();
        offThreadCount();
      };
    }
  }, [user, loadSidebar, receiveMessage, receiveEdited, receiveRemoved, toggleTyping, toggleReaction, loadPinned]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-appbg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl overflow-hidden">
            <img src="/logo.png" alt="Ping!" className="w-full h-full object-cover" />
          </div>
          <div className="skeleton h-3 w-28 rounded-full" />
        </div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <Layout />;
}

function applyReaction(messageId: string, userId: string, emoji: string, added: boolean) {
  const chat = useChatStore.getState();
  // cari conversation yang memuat message tsb di state
  for (const cid of Object.keys(chat.messages)) {
    const list = chat.messages[cid];
    if (list.some((m) => m.id === messageId)) {
      const msgs = list.map((m) =>
        m.id === messageId
          ? {
              ...m,
              reactions: added
                ? m.reactions.some((r) => r.userId === userId && r.emoji === emoji)
                  ? m.reactions
                  : [...m.reactions, { userId, emoji }]
                : m.reactions.filter((r) => !(r.userId === userId && r.emoji === emoji)),
            }
          : m
      );
      useChatStore.setState((s) => ({ messages: { ...s.messages, [cid]: msgs } }));
      break;
    }
  }
}