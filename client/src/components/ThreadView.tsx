import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chat";
import { useUIStore } from "../store/ui";
import { api, apiUrl } from "../lib/api";
import { on, joinThread, leaveThread, socketSend } from "../lib/socket";
import { Composer } from "./Composer";
import type { Message } from "../types";
function ThreadBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  if (message.isDeleted) {
    return (
      <div className="flex gap-2.5 px-4 py-1 opacity-50">
        <div className="w-8 shrink-0" />
        <span className="italic text-sm" style={{ color: "var(--sl-ink-faint)" }}>pesan dihapus</span>
      </div>
    );
  }
  return (
    <div className={`flex gap-2.5 px-4 py-1.5 ${isOwn ? "flex-row-reverse" : ""}`}>
      {message.user.avatarUrl ? (
        <img src={apiUrl(message.user.avatarUrl)} alt={message.user.name}
          className="w-8 h-8 rounded-full object-cover shrink-0 mt-0.5" />
      ) : (
        <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 mt-0.5 uppercase"
          style={{ background: "var(--sl-accent, #3E7368)" }}>
          {message.user.name.charAt(0)}
        </span>
      )}
      <div className={`flex flex-col max-w-[78%] ${isOwn ? "items-end" : ""}`}>
        <div className={`flex items-baseline gap-1.5 mb-0.5 ${isOwn ? "flex-row-reverse" : ""}`}>
          <span className="text-xs font-semibold" style={{ color: "var(--sl-ink)" }}>{message.user.name}</span>
          <span className="text-[10px]" style={{ color: "var(--sl-ink-fainter)" }}>
            {new Date(message.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}
          </span>
        </div>
        {isOwn ? (
          <div className="rounded-2xl rounded-br-sm px-3.5 py-2 bg-primary text-white text-sm leading-snug break-words">
            {message.content && <p>{message.content}</p>}
            {message.attachments?.map((a) => a.type === "IMAGE"
              ? <img key={a.id} src={apiUrl(a.thumbnailUrl || a.fileUrl)} alt="" className="mt-1 rounded-lg max-h-48 max-w-xs object-cover" />
              : <div key={a.id} className="text-xs mt-1 underline opacity-80">{a.fileName || "File"}</div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl rounded-bl-sm px-3.5 py-2 text-sm leading-snug break-words"
            style={{ background: "var(--sl-surface)", color: "var(--sl-ink)" }}>
            {message.content && <p>{message.content}</p>}
            {message.attachments?.map((a) => a.type === "IMAGE"
              ? <img key={a.id} src={apiUrl(a.thumbnailUrl || a.fileUrl)} alt="" className="mt-1 rounded-lg max-h-48 max-w-xs object-cover" />
              : <div key={a.id} className="text-xs mt-1 text-primary underline">{a.fileName || "File"}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function ThreadView({
  rootMessage,
  conversationId,
  onClose,
  readOnly,
  isAdminish,
}: {
  rootMessage: Message;
  conversationId: string;
  onClose: () => void;
  readOnly?: boolean;
  isAdminish?: boolean;
}) {
  const myId = useAuthStore((s) => s.user?.id);
  const [replies, setReplies] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [showSharePicker, setShowSharePicker] = useState(false);
  const [shareFilter, setShareFilter] = useState("");
  const [shareSending, setShareSending] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sidebar = useChatStore((s) => s.sidebar);

  const loadReplies = async () => {
    try {
      const data = await api<{ replies: Message[] }>(`/api/messages/${rootMessage.id}/replies`);
      const fetched = data.replies ?? [];
      setReplies(fetched);
      setAccessDenied(false);
      setReplies(fetched);
      // Self-correct the store's replyCount based on actual fetched count
      // This fixes stale indicators without requiring a page refresh
      const actualCount = fetched.length;
      const uniqueUsers: { name: string }[] = [];
      for (const r of fetched) {
        if (!uniqueUsers.some((u) => u.name === r.user.name) && uniqueUsers.length < 3) {
          uniqueUsers.push({ name: r.user.name });
        }
      }
      useChatStore.setState((s) => {
        const nextMessages: typeof s.messages = {};
        for (const cid of Object.keys(s.messages)) {
          const list = s.messages[cid];
          if (list.some((m) => m.id === rootMessage.id)) {
            nextMessages[cid] = list.map((m) => m.id === rootMessage.id
              ? { ...m, replyCount: actualCount, replyUsers: uniqueUsers }
              : m
            );
          } else {
            nextMessages[cid] = list;
          }
        }
        return { messages: nextMessages };
      });
    } catch (err: any) {
      if (err?.status === 403) {
        setAccessDenied(true);
      }
      setReplies([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    setReplies([]);
    loadReplies();
    joinThread(rootMessage.id);
    const off = on("thread:reply", (payload: { message: Message }) => {
      setReplies((prev) => {
        const exists = prev.some((m) => m.id === payload.message.id);
        return exists ? prev.map((m) => m.id === payload.message.id ? payload.message : m) : [...prev, payload.message];
      });
    });
    return () => {
      off();
      leaveThread(rootMessage.id);
    };
  }, [rootMessage.id]);

  useEffect(() => {
    if (!loading) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [replies.length, loading]);

  return (
    <div className="h-full flex flex-col" style={{ background: "var(--sl-bg)" }}>
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2.5"
        style={{ background: "var(--sl-surface)", borderBottom: "1px solid var(--sl-line-strong)" }}>
        <button onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded transition"
          style={{ color: "var(--sl-ink-faint)" }} title="Kembali">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: "var(--sl-ink)" }}>Thread</p>
          <p className="text-xs" style={{ color: "var(--sl-ink-faint)" }}>
            {replies.length} {replies.length === 1 ? "balasan" : "balasan"}
          </p>
        </div>
        {/* Share thread button */}
        <button
          onClick={() => setShowSharePicker(true)}
          className="text-xs font-medium px-2 py-1 rounded-lg transition hover:opacity-70"
          style={{ color: "var(--sl-accent)", background: "var(--sl-accent-soft)" }}
          title="Bagikan thread">
          ⤴ Bagikan
        </button>
        {/* Hapus Thread — admin only */}
        {isAdminish && replies.length > 0 && (
          <button
            onClick={async () => {
              if (!confirm("Hapus semua balasan di thread ini?")) return;
              setClearing(true);
              try {
                await api(`/api/messages/${rootMessage.id}/thread`, { method: "DELETE" });
                setReplies([]);
              } catch {}
              finally { setClearing(false); }
            }}
            disabled={clearing}
            className="text-xs font-medium px-2 py-1 rounded-lg transition hover:bg-hover disabled:opacity-50"
            style={{ color: "var(--sl-ink-faint)" }}
            title="Hapus semua balasan thread"
          >
            {clearing ? "…" : "Hapus Thread"}
          </button>
        )}
      </div>

      {/* Original message */}
      <div className="shrink-0 mx-3 mt-3 px-3.5 py-2.5 rounded-xl"
        style={{ background: "var(--sl-surface)", border: "1px solid var(--sl-line-strong)" }}>
        <div className="flex items-center gap-2 mb-1.5">
          {rootMessage.user.avatarUrl
            ? <img src={apiUrl(rootMessage.user.avatarUrl)} alt="" className="w-6 h-6 rounded-full object-cover" />
            : <span className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-bold uppercase"
                style={{ background: "var(--sl-accent)" }}>{rootMessage.user.name.charAt(0)}</span>
          }
          <span className="text-xs font-semibold" style={{ color: "var(--sl-ink)" }}>{rootMessage.user.name}</span>
          <span className="text-[10px]" style={{ color: "var(--sl-ink-fainter)" }}>
            {new Date(rootMessage.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}
          </span>
        </div>
        {rootMessage.content && (
          <p className="text-sm leading-snug break-words" style={{ color: "var(--sl-ink)" }}>{rootMessage.content}</p>
        )}
        {rootMessage.attachments?.length > 0 && (
          <p className="text-xs mt-1" style={{ color: "var(--sl-ink-faint)" }}>📎 {rootMessage.attachments.length} lampiran</p>
        )}
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2 px-4 py-2 shrink-0">
        <div className="flex-1 h-px" style={{ background: "var(--sl-line-strong)" }} />
        <span className="text-xs" style={{ color: "var(--sl-ink-fainter)" }}>{replies.length} balasan</span>
        <div className="flex-1 h-px" style={{ background: "var(--sl-line-strong)" }} />
      </div>

      {/* Replies */}
      <div className="flex-1 overflow-y-auto slim-scroll pb-2">
        {loading ? (
          <div className="px-4 space-y-3 pt-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex gap-2.5">
                <div className="skeleton w-8 h-8 rounded-full shrink-0" />
                <div className="flex-1 space-y-1"><div className="skeleton h-3 w-24 rounded" /><div className="skeleton h-4 w-48 rounded" /></div>
              </div>
            ))}
          </div>
        ) : accessDenied ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 px-6 py-8">
            <span className="text-4xl">🔒</span>
            <p className="text-sm font-semibold text-center" style={{ color: "var(--sl-ink)" }}>
              Tidak bisa mengakses thread ini
            </p>
            <p className="text-xs text-center" style={{ color: "var(--sl-ink-faint)" }}>
              Thread ini berasal dari group yang kamu bukan anggotanya. Minta admin untuk menambahkanmu ke group tersebut.
            </p>
          </div>
        ) : replies.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-20 gap-1">
            <p className="text-sm" style={{ color: "var(--sl-ink-faint)" }}>Belum ada balasan. Mulai diskusi!</p>
          </div>
        ) : (
          replies.map((r) => <ThreadBubble key={r.id} message={r} isOwn={r.userId === myId} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      {!readOnly && (
        <Composer
          conversationId={conversationId}
          readOnly={false}
          parentId={rootMessage.id}
          onCancelReply={undefined}
        />
      )}

      {/* Share thread picker */}
      {showSharePicker && (() => {
        const allConvos = [
          ...(sidebar?.pinnedTop || []),
          ...(sidebar?.level1 || []).flatMap((l) => [l, ...(l.subTopics || [])]),
          ...(sidebar?.dms || []),
        ].filter((c) => c.id !== conversationId);
        const filtered = allConvos.filter((c) =>
          !shareFilter || (c.name || "").toLowerCase().includes(shareFilter.toLowerCase())
        );
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowSharePicker(false)} />
            <div className="relative w-full max-w-sm rounded-2xl shadow-lg overflow-hidden"
              style={{ background: "var(--sl-bg)", border: "1px solid var(--sl-line-strong)" }}>
              <div className="flex items-center justify-between px-4 py-3 border-b"
                style={{ borderColor: "var(--sl-line-strong)" }}>
                <p className="text-sm font-semibold" style={{ color: "var(--sl-ink)" }}>Bagikan Thread ke…</p>
                <button onClick={() => setShowSharePicker(false)}
                  className="w-7 h-7 flex items-center justify-center rounded hover:bg-hover text-textm">✕</button>
              </div>
              <div className="px-3 py-2 border-b" style={{ borderColor: "var(--sl-line-strong)" }}>
                <input
                  autoFocus
                  value={shareFilter}
                  onChange={(e) => setShareFilter(e.target.value)}
                  placeholder="Cari group atau DM…"
                  className="w-full text-sm bg-transparent outline-none"
                  style={{ color: "var(--sl-ink)" }}
                />
              </div>
              <div className="max-h-60 overflow-y-auto slim-scroll">
                {filtered.length === 0 ? (
                  <p className="text-xs text-center py-4" style={{ color: "var(--sl-ink-faint)" }}>Tidak ada hasil</p>
                ) : filtered.map((c) => (
                  <button
                    key={c.id}
                    disabled={shareSending}
                    onClick={async () => {
                      setShareSending(true);
                      try {
                        const q = rootMessage.content?.slice(0, 60) ?? "";
                        const threadRef = `[THREAD:${rootMessage.id}:${conversationId}:${encodeURIComponent(q)}]`;
                        socketSend("message:send", {
                          conversationId: c.id,
                          content: threadRef,
                          attachments: [],
                          parentId: null,
                        });
                        setShowSharePicker(false);
                        setShareFilter("");
                      } finally {
                        setShareSending(false);
                      }
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-hover transition text-left"
                  >
                    <span className="w-7 h-7 flex items-center justify-center rounded-lg text-sm shrink-0"
                      style={{ background: "var(--sl-accent-soft)", color: "var(--sl-accent)" }}>
                      {c.type === "DM" ? "💬" : (c.icon || "#")}
                    </span>
                    <span className="text-sm" style={{ color: "var(--sl-ink)" }}>{c.name || "Direct Message"}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
