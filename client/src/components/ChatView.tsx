import { useEffect, useRef, useState, useMemo, useLayoutEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chat";
import { useUIStore } from "../store/ui";
import { api, apiUrl } from "../lib/api";
import { markRead, joinConversation } from "../lib/socket";
import { MessageBubble, Avatar } from "./MessageBubble";
import { Composer } from "./Composer";
import { PinnedTab } from "./PinnedTab";
import { LibraryTab } from "./LibraryTab";
import { TaskBar } from "./TaskBar";
import { ConversationInfoPanel } from "./ConversationInfoPanel";
import { useModal } from "./Modal";
import type { Message } from "../types";

// H-8: stable empty array to avoid new reference on every render
const EMPTY_TYPING: { userId: string; userName: string }[] = [];

type Tab = "chat" | "pinned" | "library";

export function ChatView() {
  const { t } = useTranslation();
  const { toast, confirm, prompt } = useModal();
  const id = useChatStore((s) => s.activeId)!;
  const messages = useChatStore((s) => s.messages[id] || []);
  const loading = useChatStore((s) => s.messagesLoading[id]);
  const prevCursor = useChatStore((s) => s.prevCursor[id]);
  const loadingMore = useChatStore((s) => s.loadingMore[id]);
  const loadMoreMessages = useChatStore((s) => s.loadMoreMessages);
  const convo = useChatStore((s) => s.conversation[id]);
  const perms = useChatStore((s) => s.permissions[id]);
  const typing = useChatStore((s) => s.typing[id] ?? EMPTY_TYPING);
  const openConversation = useChatStore((s) => s.openConversation);
  const deleteMessage = useChatStore((s) => s.deleteMessage);
  const editMessage = useChatStore((s) => s.editMessage);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const setChatOpen = useUIStore((s) => s.setChatOpen);
  const openForward = useUIStore((s) => s.openForward);
  const myId = useAuthStore((s) => s.user?.id);

  const [tab, setTab] = useState<Tab>("chat");
  const [editing, setEditing] = useState<Message | null>(null);
  const [editText, setEditText] = useState("");
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessagesCountRef = useRef(0);
  const prevScrollHeightRef = useRef(0);
  const isLoadingMoreRef = useRef(false);

  // Preserve scroll position when older messages are prepended
  useLayoutEffect(() => {
    if (isLoadingMoreRef.current && scrollRef.current) {
      const newScrollHeight = scrollRef.current.scrollHeight;
      const diff = newScrollHeight - prevScrollHeightRef.current;
      scrollRef.current.scrollTop += diff;
      isLoadingMoreRef.current = false;
    }
  }, [messages.length]);

  // Infinite scroll — load older messages when top sentinel is visible
  useEffect(() => {
    const el = topRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && prevCursor && !loadingMore && !loading) {
          // Capture scroll height before loading
          if (scrollRef.current) {
            prevScrollHeightRef.current = scrollRef.current.scrollHeight;
            isLoadingMoreRef.current = true;
          }
          loadMoreMessages(id);
        }
      },
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [id, prevCursor, loadingMore, loading, loadMoreMessages]);

  useEffect(() => {
    openConversation(id);
    markRead(id);
    joinConversation(id);
    prevMessagesCountRef.current = 0;
    isLoadingMoreRef.current = false;
  }, [id]);

  // Scroll to bottom only for new messages (not load-more prepends)
  useEffect(() => {
    if (loading) return; // don't scroll during initial load
    const prev = prevMessagesCountRef.current;
    const curr = messages.length;
    prevMessagesCountRef.current = curr;
    // Only scroll if messages were appended (new message), not prepended (load more)
    if (curr > prev && !isLoadingMoreRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, loading]);

  const isDM = convo?.type === "DM";
  // Use server-computed canPost — it already accounts for isReadOnly AND admin role
  const readOnly = perms?.canPost === false;
  const isOwn = (m: Message) => m.userId === myId;
  const chanPrefix = isDM ? "" : "#";
  // For DMs, the server stores name=null and resolves partner name only in sidebar.
  // Resolve it here from the members list, falling back to sidebar data.
  const sidebar = useChatStore((s) => s.sidebar);
  const dmPartnerName = isDM
    ? convo?.members?.find((m) => m.user.id !== myId)?.user?.name
      ?? sidebar?.dms.find((d) => d.id === id)?.name
      ?? null
    : null;
  const name = isDM ? (dmPartnerName || "Direct Message") : (convo?.name || "Chat");

  const handleForward = (m: Message) =>
    openForward({ message: m, sourceConversationId: id, sourceName: convo?.name ?? null });

  const handlePin = async (m: Message) => {
    const note = await prompt({ title: "Pin Pesan", message: "Label/catatan (opsional):", placeholder: "Tulis catatan…", confirmLabel: "Pin" });
    if (note === null) return;
    try { await api(`/api/messages/${m.id}/pin`, { method: "POST", body: { note: note || undefined } }); setTab("pinned"); }
    catch (e: any) { toast(e?.message || "Gagal pin"); }
  };

  const handleDelete = async (m: Message) => {
    const ok = await confirm({ title: "Hapus Pesan", message: "Hapus pesan ini secara permanen?", confirmLabel: "Hapus", danger: true });
    if (!ok) return;
    try { await deleteMessage(id, m.id); }
    catch (e: any) { toast(e?.message || "Gagal hapus"); }
  };

  const handleEdit = (m: Message) => { setEditing(m); setEditText(m.content || ""); };
  const submitEdit = async () => {
    if (!editing) return;
    try { await editMessage(id, editing.id, editText); setEditing(null); }
    catch (e: any) { toast(e?.message || "Gagal edit"); }
  };

  const handleCreateTask = async (m: Message) => {
    if (!m.content) return;
    try {
      await api(`/api/tasks/${id}`, { method: "POST", body: { content: m.content, messageId: m.id } });
      // Socket event task:created will update the store for all members including sender
    } catch (e: any) { toast(e?.message || "Gagal buat task"); }
  };

  const handleRetry = (m: Message) => {
    const attachments = (m.attachments || []).map((a) => ({
      type: a.type, fileUrl: a.fileUrl, thumbnailUrl: a.thumbnailUrl,
      fileName: a.fileName ?? "", fileSize: a.fileSize ?? undefined,
    }));
    sendMessage(id, m.content || undefined, attachments, m.parentId);
  };

  // Group consecutive messages from same sender
  const isPrevSameSender = (i: number) => {
    if (i === 0) return false;
    const prev = messages[i - 1];
    const cur = messages[i];
    if (prev.userId !== cur.userId) return false;
    const diff = new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime();
    return diff < 5 * 60 * 1000; // 5 min grouping
  };

  const memberCount = convo?.members?.length;
  const partnerOnline = isDM && convo?.members?.find((m) => m.user.id !== myId)?.user?.status === "online";

  return (
    <div className="h-full flex flex-col chat-window-bg">
      {/* Channel header — Studio Ledger light style */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5"
        style={{
          background: "var(--sl-surface, #EDECE5)",
          borderBottom: "1px solid var(--sl-line-strong, #DEDCD2)",
        }}>
        {/* Back button — mobile only */}
        <button onClick={() => setChatOpen(false)}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded transition"
          style={{ color: "var(--sl-ink-faint, #8B8A7E)" }}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>

        {isDM && convo?.members && (
          <Avatar name={convo.members.find((m) => m.user.id !== myId)?.user?.name || name} size={32} />
        )}
        {!isDM && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden"
            style={{ background: "var(--sl-accent-soft, #EAF1EE)", color: "var(--sl-accent, #3E7368)" }}>
            {convo?.icon && (convo.icon.startsWith("/") || convo.icon.startsWith("http")) ? (
              <img src={apiUrl(convo.icon)} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="font-bold text-sm">{convo?.icon || "#"}</span>
            )}
          </div>
        )}

        {/* Clickable title area — opens info panel */}
        <button
          onClick={() => setInfoOpen(true)}
          className="flex-1 min-w-0 text-left hover:opacity-80 transition"
        >
          <h2 className="font-bold text-[1.05em] truncate leading-tight"
            style={{ color: "var(--sl-ink, #22221D)", fontFamily: "var(--font-display, 'Space Grotesk', sans-serif)" }}>
            {name}
          </h2>
          {isDM ? (
            <p className="text-[0.72em] font-medium" style={{ color: partnerOnline ? "var(--sl-accent, #3E7368)" : "var(--sl-ink-fainter, #A6A498)" }}>
              {partnerOnline ? "● Aktif" : "● Offline"}
            </p>
          ) : convo?.description ? (
            <p className="text-[0.72em] truncate hidden md:block" style={{ color: "var(--sl-ink-faint, #8B8A7E)" }}>{convo.description}</p>
          ) : (
            <p className="text-[0.72em] hidden md:block" style={{ color: "var(--sl-ink-fainter, #A6A498)" }}>Klik untuk info & pengaturan</p>
          )}
        </button>

        {/* Right actions */}
        <div className="flex items-center gap-0.5">
          {memberCount && !isDM && (
            <button onClick={() => setInfoOpen(true)} className="flex items-center gap-1 px-2 h-8 rounded-lg transition text-sm"
              style={{ color: "var(--sl-ink-faint, #8B8A7E)" }}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="7" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
              <span className="text-xs">{memberCount}</span>
            </button>
          )}
          {/* Tabs */}
          {[
            { key: "chat", label: "Chat" },
            { key: "pinned", label: "📌" },
            { key: "library", label: "🗂️" },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key as Tab)}
              className="px-2.5 h-8 rounded-lg text-sm font-medium transition"
              style={{
                background: tab === key ? "var(--sl-accent-soft, #EAF1EE)" : "transparent",
                color: tab === key ? "var(--sl-accent, #3E7368)" : "var(--sl-ink-faint, #8B8A7E)",
              }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {tab === "pinned" ? <PinnedTab conversationId={id} /> :
       tab === "library" ? <LibraryTab conversationId={id} /> : (
        <>
          {/* Task bar — pinned top */}
          <TaskBar conversationId={id} />

          {/* Message list */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto overflow-x-clip slim-scroll pt-4 pb-2">
            {/* Top sentinel for infinite scroll */}
            <div ref={topRef} className="h-1" />

            {/* Load more indicator */}
            {loadingMore && (
              <div className="flex justify-center py-3">
                <div className="flex items-center gap-2 text-xs text-textm">
                  <div className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                  Memuat pesan lama…
                </div>
              </div>
            )}

            {/* No more messages indicator */}
            {!prevCursor && messages.length > 0 && !loading && (
              <div className="flex items-center gap-3 px-5 py-4">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-textm shrink-0">Awal percakapan</span>
                <div className="flex-1 h-px bg-border" />
              </div>
            )}

            {loading && messages.length === 0 ? (
              <div className="px-5 space-y-4 pt-4">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="flex gap-3">
                    <div className="skeleton w-9 h-9 rounded" />
                    <div className="flex-1 space-y-1.5">
                      <div className="skeleton h-3.5 w-32 rounded" />
                      <div className="skeleton h-4 w-64 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ) : messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-textm px-8">
                <div className="text-4xl mb-3">{isDM ? "💬" : "#"}</div>
                <h3 className="font-bold text-textp text-lg mb-1">
                  {isDM ? `Ini adalah awal percakapanmu dengan ${name}` : `Selamat datang di #${name}`}
                </h3>
                <p className="text-sm text-center">{isDM ? "Kirim pesan langsung, file, atau reaksi." : "Ini adalah awal dari channel ini."}</p>
              </div>
            ) : (
              messages.map((m, i) => {
                // Date separator
                const msgDate = new Date(m.createdAt).toDateString();
                const prevDate = i > 0 ? new Date(messages[i - 1].createdAt).toDateString() : null;
                const showDateSep = msgDate !== prevDate;
                const dateLabel = (() => {
                  const d = new Date(m.createdAt);
                  const today = new Date();
                  const yesterday = new Date(today);
                  yesterday.setDate(today.getDate() - 1);
                  if (d.toDateString() === today.toDateString()) return "Hari ini";
                  if (d.toDateString() === yesterday.toDateString()) return "Kemarin";
                  return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
                })();
                return (
                  <div key={m.id}>
                    {showDateSep && (
                      <div className="flex items-center gap-3 px-5 py-3">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-xs font-medium text-textm bg-appbg px-2 shrink-0">{dateLabel}</span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                    )}
                    <MessageBubble
                      message={m}
                      isOwn={isOwn(m)}
                      showSender={!isPrevSameSender(i)}
                      canStaffPin={perms?.canStaffPin ?? true}
                      isAdminish={perms?.isAdmin || perms?.isManagerOrAbove || false}
                      parentMessage={m.parentId ? messages.find((x) => x.id === m.parentId) ?? null : null}
                      onForward={handleForward}
                      onReply={setReplyTo}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onPin={handlePin}
                      onCreateTask={handleCreateTask}
                      onRetry={handleRetry}
                    />
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Typing indicator */}
          {typing.length > 0 && (
            <div className="shrink-0 px-5 pb-1 text-xs text-textm italic">
              {typing.length === 1
                ? `${typing[0].userName} sedang mengetik…`
                : typing.length === 2
                ? `${typing[0].userName} dan ${typing[1].userName} sedang mengetik…`
                : `${typing.length} orang sedang mengetik…`}
            </div>
          )}

          {/* Edit bar */}
          {editing && (
            <div className="shrink-0 mx-4 mb-2 p-3 rounded-xl border border-warning bg-warning/5">
              <div className="text-xs text-warning font-semibold mb-1.5">✏️ Mengedit pesan</div>
              <textarea
                className="input-base w-full text-sm resize-none mb-2"
                value={editText}
                rows={Math.min(6, Math.max(2, editText.split("\n").length))}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(); } if (e.key === "Escape") setEditing(null); }}
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button onClick={() => setEditing(null)} className="px-3 h-8 rounded border border-border text-sm text-textm">Batal</button>
                <button onClick={submitEdit} className="px-3 h-8 rounded bg-primary text-white text-sm font-semibold hover:bg-primaryhover">Simpan</button>
              </div>
            </div>
          )}

          {/* Composer */}
          <Composer
            conversationId={id}
            readOnly={!!readOnly}
            parentId={replyTo ? replyTo.id : null}
            replyTo={replyTo ? { name: replyTo.user?.name || "", content: replyTo.content } : null}
            onCancelReply={() => setReplyTo(null)}
          />
        </>
      )}

      {/* Conversation Info Panel */}
      {infoOpen && (
        <ConversationInfoPanel conversationId={id} onClose={() => setInfoOpen(false)} />
      )}
    </div>
  );
}