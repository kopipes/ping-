import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chat";
import { useUIStore } from "../store/ui";
import { api } from "../lib/api";
import { markRead, joinConversation } from "../lib/socket";
import { MessageBubble, Avatar } from "./MessageBubble";
import { Composer } from "./Composer";
import { PinnedTab } from "./PinnedTab";
import { LibraryTab } from "./LibraryTab";
import { useModal } from "./Modal";
import type { Message } from "../types";

type Tab = "chat" | "pinned" | "library";

export function ChatView() {
  const { t } = useTranslation();
  const { toast, confirm, prompt } = useModal();
  const id = useChatStore((s) => s.activeId)!;
  const messages = useChatStore((s) => s.messages[id] || []);
  const loading = useChatStore((s) => s.messagesLoading[id]);
  const convo = useChatStore((s) => s.conversation[id]);
  const perms = useChatStore((s) => s.permissions[id]);
  const typing = useChatStore((s) => s.typing[id] || []);
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
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    openConversation(id);
    markRead(id);
    joinConversation(id);
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const isDM = convo?.type === "DM";
  const readOnly = convo?.isReadOnly || perms?.canPost === false;
  const isOwn = (m: Message) => m.userId === myId;
  const chanPrefix = isDM ? "" : "#";
  const name = convo?.name || (isDM ? "Direct Message" : "Chat");

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
      {/* Channel header — modern navy style */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5 border-b border-border bg-gradient-to-r from-sb to-sb/80 text-white shadow-sm">
        {/* Back button — mobile only */}
        <button onClick={() => setChatOpen(false)}
          className="md:hidden w-8 h-8 flex items-center justify-center rounded hover:bg-white/10 text-white/70 transition">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>

        {isDM && convo?.members && (
          <Avatar name={convo.members.find((m) => m.user.id !== myId)?.user?.name || name} size={28} />
        )}
        {!isDM && (
          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
            <span className="text-white/90 font-bold text-sm">#</span>
          </div>
        )}

        <div className="flex-1 min-w-0">
          <h2 className="font-bold text-white text-[1.05em] truncate leading-tight">
            {name}
          </h2>
          {isDM ? (
            <p className={`text-[0.72em] font-medium ${partnerOnline ? "text-success" : "text-white/50"}`}>
              {partnerOnline ? "● Aktif" : "● Offline"}
            </p>
          ) : convo?.description ? (
            <p className="text-[0.72em] text-white/55 truncate hidden md:block">{convo.description}</p>
          ) : null}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-0.5">
          {memberCount && !isDM && (
            <button className="flex items-center gap-1 px-2 h-8 rounded-lg hover:bg-white/10 text-white/70 text-sm transition">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="7" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/></svg>
              <span className="text-xs">{memberCount}</span>
            </button>
          )}
          {/* Tabs */}
          {[
            { key: "chat", label: "Chat", icon: <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
            { key: "pinned", label: "📌", icon: null },
            { key: "library", label: "🗂️", icon: null },
          ].map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key as Tab)}
              className={`px-2.5 h-8 rounded-lg text-sm font-medium transition ${tab === key ? "bg-white/20 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {tab === "pinned" ? <PinnedTab conversationId={id} /> :
       tab === "library" ? <LibraryTab conversationId={id} /> : (
        <>
          {/* Message list */}
          <div className="flex-1 overflow-y-auto overflow-x-clip slim-scroll py-2">
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
              messages.map((m, i) => (
                <MessageBubble
                  key={m.id}
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
                  onRetry={handleRetry}
                />
              ))
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
              <div className="flex gap-2">
                <input className="input-base flex-1 !py-1.5 text-sm" value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(); } if (e.key === "Escape") setEditing(null); }}
                  autoFocus />
                <button onClick={submitEdit} className="px-3 h-8 rounded bg-primary text-white text-sm font-semibold hover:bg-primaryhover">Simpan</button>
                <button onClick={() => setEditing(null)} className="px-3 h-8 rounded border border-border text-sm text-textm">Batal</button>
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
    </div>
  );
}