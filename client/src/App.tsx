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
      const offMessage = on("message:new", (m: Message) => receiveMessage(m));
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
      });
      // Re-join all conversation rooms after reconnect (server drops membership on disconnect)
      const offReconnected = on("socket:reconnected", () => {
        const { sidebar, activeId, messages } = useChatStore.getState();
        const roomIds = new Set<string>();
        if (activeId) roomIds.add(activeId);
        Object.keys(messages).forEach((id) => roomIds.add(id));
        // Also re-join all sidebar conversations so messages arrive without opening them
        if (sidebar) {
          sidebar.pinnedTop?.forEach((c) => roomIds.add(c.id));
          sidebar.level1?.forEach((c) => {
            roomIds.add(c.id);
            c.subTopics?.forEach((s) => roomIds.add(s.id));
          });
          sidebar.dms?.forEach((c) => roomIds.add(c.id));
        }
        roomIds.forEach((id) => joinConversation(id));
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
      };
    }
  }, [user, loadSidebar, receiveMessage, receiveEdited, receiveRemoved, toggleTyping, toggleReaction, loadPinned]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-appbg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center text-white text-xl font-bold">Pi</div>
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