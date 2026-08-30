import { useState, useEffect, useRef, useMemo } from "react";

// Stable empty object — avoids creating a new reference on every render
// when a conversation has no read receipts yet
const EMPTY_READ_AT: Record<string, string> = {};
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chat";
import { assetUrl } from "../store/chat";
import { apiUrl, api } from "../lib/api";
import { useUIStore } from "../store/ui";
import type { Message } from "../types";

const EMOJIS = ["👍", "❤️", "😂", "🎉", "😮", "✅"];

export function formatMessageTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Avatar({ name, avatarUrl, size = 36 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const colors = ["#E01E5A","#ECB22E","#2BAC76","#1264A3","#611f69","#36C5F0","#4A154B","#FF612B"];
  const color = colors[name.charCodeAt(0) % colors.length];
  if (avatarUrl) {
    return (
      <img
        src={apiUrl(avatarUrl)}
        alt={name}
        style={{ width: size, height: size, borderRadius: 4 }}
        className="inline-block object-cover shrink-0"
      />
    );
  }
  return (
    <span
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.44, borderRadius: 4 }}
      className="inline-flex items-center justify-center text-white font-bold shrink-0 uppercase leading-none"
    >
      {name.charAt(0)}
    </span>
  );
}

export function MessageBubble(props: {
  message: Message;
  isOwn: boolean;
  showSender: boolean;
  canStaffPin: boolean;
  isAdminish: boolean;
  parentMessage?: Message | null;
  onForward: (m: Message) => void;
  onReply: (m: Message) => void;
  onEdit: (m: Message) => void;
  onDelete: (m: Message) => void;
  onPin: (m: Message) => void;
  onRetry?: (m: Message) => void;
}) {
  const { t } = useTranslation();
  const { message, isOwn, showSender, canStaffPin, isAdminish, onForward, onRetry, parentMessage } = props;
  const myId = useAuthStore((s) => s.user?.id);
  const toggleReaction = useChatStore((s) => s.toggleReaction);
  const activeId = useChatStore((s) => s.activeId);
  const readAt = useChatStore((s) => s.readAt[message.conversationId] ?? EMPTY_READ_AT);
  const openForward = useUIStore((s) => s.openForward);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0 });

  // Determine read status for own messages.
  // Uses stable EMPTY_READ_AT to avoid re-renders when no receipts exist.
  // useMemo avoids repeated Date parsing across N bubbles × M store updates.
  const msgTime = useMemo(() => new Date(message.createdAt).getTime(), [message.createdAt]);
  const isRead = useMemo(
    () => isOwn && Object.entries(readAt).some(([uid, at]) => uid !== myId && new Date(at).getTime() >= msgTime),
    [isOwn, readAt, myId, msgTime]
  );

  const openMenu = () => {
    if (menuBtnRef.current) {
      const r = menuBtnRef.current.getBoundingClientRect();
      const menuH = 280;
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      // Open downward if there's enough space below, otherwise open upward
      let top: number;
      if (spaceBelow >= menuH) {
        // enough space below — open down
        top = r.bottom + 4;
      } else if (spaceAbove >= menuH) {
        // not enough below, but enough above — open up
        top = r.top - menuH - 4;
      } else {
        // neither side has enough — pick the side with more space
        top = spaceBelow >= spaceAbove
          ? window.innerHeight - menuH - 8
          : 8;
      }
      setMenuPos({
        top: Math.max(8, Math.min(top, window.innerHeight - menuH - 8)),
        left: Math.min(Math.max(8, r.left), window.innerWidth - 216),
      });
    }
    setMenuOpen(true);
  };

  if (message.isDeleted) {
    return (
      <div className={`msg-row ${isOwn ? "justify-end" : ""} opacity-60`}>
        {!isOwn && <div className="w-9 shrink-0" />}
        <span className="italic text-textm text-sm">pesan dihapus</span>
      </div>
    );
  }

  const isSending = message.status === "sending";
  const isFailed = message.status === "failed";
  const attachments = message.attachments || [];

  // ── Own messages: right-aligned blue bubble ──────────────────────────────
  if (isOwn) {
    return (
      <div className={`msg-own flex items-end justify-end gap-2 px-4 py-0.5 relative ${isFailed ? "bg-red-50" : ""}`}>
        {/* Action bar floats to the left on hover (desktop only) */}
        {!isSending && !isFailed && (
          <div className="msg-actions gap-0.5 px-1 order-first">
            {EMOJIS.slice(0, 3).map((e) => (
              <button key={e} onClick={() => activeId && toggleReaction(activeId, message.id, e)}
                className="w-7 h-7 flex items-center justify-center text-sm hover:bg-hover rounded transition">
                {e}
              </button>
            ))}
            <div className="w-px h-4 bg-border mx-0.5" />
            <button ref={menuBtnRef} onClick={openMenu}
              className="w-7 h-7 flex items-center justify-center text-textm hover:bg-hover rounded transition text-xs font-bold">
              •••
            </button>
            {menuOpen && createPortal(
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="fixed z-50 w-52 bg-white rounded-xl shadow-lg border border-border p-1 fade-slide-up"
                  style={{ top: menuPos.top, left: menuPos.left }}>
                  <div className="flex items-center gap-0.5 pb-1.5 mb-1 border-b border-border px-1">
                    {EMOJIS.map((e) => (
                      <button key={e} onClick={() => { setMenuOpen(false); activeId && toggleReaction(activeId, message.id, e); }}
                        className="w-8 h-8 rounded text-base hover:bg-hover transition">{e}</button>
                    ))}
                  </div>
                  <ActionItem label="Edit pesan" icon="✏️" onClick={() => { setMenuOpen(false); props.onEdit(message); }} />
                  <ActionItem label="Balas" icon="↩️" onClick={() => { setMenuOpen(false); props.onReply(message); }} />
                  <ActionItem label="Teruskan" icon="⤴️" onClick={() => { setMenuOpen(false); props.onForward(message); }} />
                  <ActionItem label="Bagikan" icon="🔗" onClick={() => { setMenuOpen(false); shareExternal(message); }} />
                  {(isAdminish || canStaffPin) && (
                    <ActionItem label="Pin pesan" icon="📌" onClick={() => { setMenuOpen(false); props.onPin(message); }} />
                  )}
                  <ActionItem label="Hapus" icon="🗑️" onClick={() => { setMenuOpen(false); props.onDelete(message); }} danger />
                </div>
              </>,
              document.body
            )}
          </div>
        )}

        {/* Bubble — unified container wrapping quote + text */}
        <div className="flex flex-col items-end max-w-[72%]">
          <div className={`rounded-2xl rounded-br-sm overflow-hidden ${
            isSending ? "bg-primary/60" : isFailed ? "bg-danger/80" : "bg-primary"
          }`}>
            {/* Reply quote inside bubble */}
            {parentMessage && (
              <div className="bg-black/20 border-l-[3px] border-white/70 px-3 py-1.5 mx-0">
                <div className="text-[11px] font-bold text-white/90 truncate">{parentMessage.user?.name}</div>
                <div className="text-[12px] text-white/75 truncate">
                  {parentMessage.isDeleted ? "Pesan dihapus" : (parentMessage.content?.slice(0, 80) ?? (parentMessage.attachments?.length ? "📎 Lampiran" : ""))}
                </div>
              </div>
            )}

            {/* Forward indicator */}
            {message.isForwarded && (
              <div className="flex items-center gap-1 text-[11px] text-white/70 px-3.5 pt-1.5 -mb-1">
                <span>⤴</span><span>dari {message.forwardedFromName}</span>
              </div>
            )}

            {/* Images */}
            {attachments.filter((a) => a.type === "IMAGE").length > 0 && (
              <div className="flex flex-wrap gap-1 p-1 justify-end">
                {attachments.filter((a) => a.type === "IMAGE").map((a) => (
                  <a key={a.id} href={assetUrl(a.fileUrl)} target="_blank" rel="noreferrer">
                    <img src={assetUrl(a.thumbnailUrl || a.fileUrl)} alt={a.fileName || ""} className="rounded-xl max-h-56 max-w-xs object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            )}

            {/* Files */}
            {attachments.filter((a) => a.type === "FILE").map((a) => (
              <a key={a.id} href={assetUrl(a.fileUrl)} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 bg-white/10 px-3 py-2 mb-0.5 text-sm max-w-xs hover:bg-white/20 transition">
                <span>📎</span>
                <span className="truncate text-white font-medium">{a.fileName || "File"}</span>
              </a>
            ))}

            {/* Text */}
            {message.content && (
              <div className="px-3.5 py-2 text-white leading-[1.46] whitespace-pre-wrap break-words"
                style={{ fontSize: "var(--app-font-size, 15px)" }}>
                {message.content}
              </div>
            )}
          </div>

          {/* Link previews — own message */}
          {!isSending && !isFailed && extractUrls(message.content).map((url) => (
            <LinkPreviewCard key={url} url={url} dark />
          ))}

          {/* Meta row */}
          <div className="flex items-center gap-1.5 mt-0.5 pr-0.5">
            {message.isEdited && <span className="text-[10px] text-textm">(diubah)</span>}
            {isSending && <span className="text-[10px] text-textm">Mengirim…</span>}
            {isFailed && (
              <button onClick={() => onRetry?.(message)} className="text-[10px] text-danger underline">Gagal — kirim ulang</button>
            )}
            <span className="text-[11px] text-textm">{formatMessageTime(message.createdAt)}</span>
            {!isFailed && !isSending && (
              <span
                className={`text-[11px] font-medium ${isRead ? "text-sky-200" : "text-white/80"}`}
                title={isRead ? "Dibaca" : "Terkirim"}
              >
                {isRead ? "✓✓" : "✓"}
              </span>
            )}
            {/* Mobile-only menu trigger */}
            {!isSending && !isFailed && (
              <button onClick={() => setMenuOpen(true)}
                className="md:hidden ml-1 w-6 h-6 flex items-center justify-center text-white/60 hover:text-white rounded text-[10px] font-bold">
                •••
              </button>
            )}
          </div>

          {/* Reactions */}
          {message.reactions.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1 justify-end">
              {Array.from(message.reactions.reduce((acc, r) => { acc.set(r.emoji, (acc.get(r.emoji)||0)+1); return acc; }, new Map<string,number>())).map(([emoji, count]) => {
                const isMine = message.reactions.some((r) => r.userId === myId && r.emoji === emoji);
                return (
                  <button key={emoji} onClick={() => activeId && toggleReaction(activeId, message.id, emoji)}
                    className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border transition ${isMine ? "bg-primary/10 border-primary/40 text-primary" : "bg-white border-border text-textp hover:border-textm"}`}>
                    {emoji}<span className="font-medium">{count}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Others' messages: left-aligned bubble ────────────────────────────────
  return (
    <div className={`msg-row ${isFailed ? "bg-red-50" : ""}`}>
      {/* Avatar col */}
      <div className="w-9 shrink-0 pt-0.5">
        {showSender ? (
          <Avatar name={message.user?.name || "?"} avatarUrl={message.user?.avatarUrl} />
        ) : (
          <span className="w-9 text-[11px] text-textm text-right hidden group-hover:block leading-[1.46]">
            {formatMessageTime(message.createdAt)}
          </span>
        )}
      </div>

      {/* Content col */}
      <div className="flex-1 min-w-0">
        {/* Sender name + time — outside bubble */}
        {showSender && (
          <div className="flex items-baseline gap-2 mb-0.5">
            <span className="font-bold text-textp text-sm leading-tight">{message.user?.name}</span>
            <span className="text-[11px] text-textm">{formatMessageTime(message.createdAt)}</span>
            {isSending && <span className="text-[11px] text-textm">Mengirim…</span>}
            {isFailed && (
              <span className="text-[11px] text-danger font-medium">
                Gagal —{" "}
                <button onClick={() => onRetry?.(message)} className="underline">coba lagi</button>
              </span>
            )}
          </div>
        )}

        {/* Main bubble — wraps reply quote + all content */}
        <div className={`inline-block max-w-[85%] rounded-2xl rounded-tl-sm bg-hover border border-border ${isSending ? "opacity-70" : ""}`}>

          {/* Reply quote inside bubble */}
          {parentMessage && (
            <div className="bg-primary/15 border-l-[3px] border-primary rounded-tl-2xl rounded-tr-2xl px-3 py-2 cursor-pointer hover:bg-primary/20 transition">
              <div className="text-[11px] font-bold text-primary truncate">{parentMessage.user?.name}</div>
              <div className="text-[12px] text-texts truncate">
                {parentMessage.isDeleted ? "Pesan dihapus" : (parentMessage.content?.slice(0, 80) ?? (parentMessage.attachments?.length ? "📎 Lampiran" : ""))}
              </div>
            </div>
          )}

          {/* Bubble content */}
          <div className="px-3.5 py-2">
            {message.isForwarded && (
              <div className="flex items-center gap-1.5 text-[11px] text-textm mb-1.5 border-l-2 border-border pl-2">
                <span>⤴</span><span>dari {message.forwardedFromName || "chat lain"}</span>
              </div>
            )}

            {/* Images */}
            {attachments.filter((a) => a.type === "IMAGE").length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.filter((a) => a.type === "IMAGE").map((a) => (
                  <a key={a.id} href={assetUrl(a.fileUrl)} target="_blank" rel="noreferrer">
                    <img src={assetUrl(a.thumbnailUrl || a.fileUrl)} alt={a.fileName || "image"}
                      className="rounded-lg max-h-56 max-w-xs border border-border/30 object-cover" loading="lazy" />
                  </a>
                ))}
              </div>
            )}

            {/* Files */}
            {attachments.filter((a) => a.type === "FILE").map((a) => (
              <a key={a.id} href={assetUrl(a.fileUrl)} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 bg-white/60 border border-border/40 rounded-lg p-2.5 mb-1.5 hover:bg-white transition max-w-sm">
                <span className="text-xl shrink-0">📎</span>
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate text-textp">{a.fileName || "File"}</div>
                  <div className="text-xs text-textm">{a.fileSize ? `${(a.fileSize / 1024).toFixed(0)} KB` : ""}</div>
                </div>
              </a>
            ))}

            {/* Links */}
            {attachments.filter((a) => a.type === "LINK").map((a) => {
              const meta = (() => { try { return a.linkMetadata ? JSON.parse(a.linkMetadata) : null; } catch { return null; } })();
              return (
                <a key={a.id} href={a.fileUrl} target="_blank" rel="noreferrer"
                  className="flex gap-3 border-l-4 border-primary pl-3 pr-3 py-2 mb-1.5 hover:bg-white/50 transition max-w-sm rounded-r-lg">
                  {meta?.image && <img src={meta.image} alt="" className="w-16 h-12 object-cover rounded shrink-0" onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-textp truncate">{meta?.title || a.fileUrl}</div>
                    {meta?.description && <div className="text-xs text-textm line-clamp-2 mt-0.5">{meta.description}</div>}
                    <div className="text-xs text-primary truncate mt-0.5">{a.fileUrl}</div>
                  </div>
                </a>
              );
            })}

            {/* Text */}
            {message.content && (
              <p className="leading-[1.46668] text-textp whitespace-pre-wrap break-words"
                style={{ fontSize: "var(--app-font-size, 15px)" }}>
                {message.content}
              </p>
            )}

            {/* Edited */}
            {message.isEdited && <span className="text-[10px] text-textm">(diubah)</span>}
          </div>
        </div>

        {/* Link previews */}
        {!isSending && extractUrls(message.content).map((url) => (
          <LinkPreviewCard key={url} url={url} />
        ))}

        {/* Reactions */}
        {message.reactions.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {Array.from(message.reactions.reduce((acc, r) => { acc.set(r.emoji, (acc.get(r.emoji) || 0) + 1); return acc; }, new Map<string, number>())).map(([emoji, count]) => {
              const isMine = message.reactions.some((r) => r.userId === myId && r.emoji === emoji);
              return (
                <button key={emoji} onClick={() => activeId && toggleReaction(activeId, message.id, emoji)}
                  className={`flex items-center gap-1 text-sm px-2 py-0.5 rounded border transition ${isMine ? "bg-primary/10 border-primary/40 text-primary" : "bg-hover border-border text-textp hover:border-textm"}`}>
                  {emoji} <span className="text-xs font-medium">{count}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating action bar (on hover, desktop) */}
      {!isSending && !isFailed && (
        <div className="msg-actions gap-0.5 px-1">
          {EMOJIS.slice(0, 3).map((e) => (
            <button key={e} onClick={() => activeId && toggleReaction(activeId, message.id, e)}
              className="w-8 h-8 flex items-center justify-center text-base hover:bg-hover rounded transition">{e}</button>
          ))}
          <div className="w-px h-5 bg-border mx-0.5" />
          <button ref={menuBtnRef} onClick={openMenu}
            className="w-8 h-8 flex items-center justify-center text-textm hover:bg-hover rounded transition text-xs font-bold">•••</button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="fixed z-50 w-52 bg-white rounded-xl shadow-lg border border-border p-1 fade-slide-up"
                style={{ top: menuPos.top, left: menuPos.left }}>
                <div className="flex items-center gap-0.5 pb-1.5 mb-1 border-b border-border px-1">
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => { setMenuOpen(false); activeId && toggleReaction(activeId, message.id, e); }}
                      className="w-8 h-8 rounded text-base hover:bg-hover transition">{e}</button>
                  ))}
                </div>
                {isOwn && <ActionItem label="Edit pesan" icon="✏️" onClick={() => { setMenuOpen(false); props.onEdit(message); }} />}
                <ActionItem label="Balas" icon="↩️" onClick={() => { setMenuOpen(false); props.onReply(message); }} />
                <ActionItem label="Teruskan" icon="⤴️" onClick={() => { setMenuOpen(false); props.onForward(message); }} />
                <ActionItem label="Bagikan" icon="🔗" onClick={() => { setMenuOpen(false); shareExternal(message); }} />
                {(isAdminish || canStaffPin) && (
                  <ActionItem label="Pin pesan" icon="📌" onClick={() => { setMenuOpen(false); props.onPin(message); }} />
                )}
                {(isOwn || isAdminish) && <ActionItem label="Hapus" icon="🗑️" onClick={() => { setMenuOpen(false); props.onDelete(message); }} danger />}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function ActionItem({ label, icon, onClick, danger }: { label: string; icon: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg transition hover:bg-hover ${danger ? "text-danger" : "text-textp"}`}>
      <span>{icon}</span>{label}
    </button>
  );
}

async function shareExternal(message: Message) {
  const text = [message.content, ...(message.attachments || []).map((a) => a.fileUrl), "— via Ping!"].filter(Boolean).join("\n");
  if (typeof navigator.share === "function") {
    try { await navigator.share({ text }); return; } catch {}
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
}

export { EMOJIS, Avatar };
export function buildShareText(message: Message) {
  return [message.content, ...(message.attachments || []).map((a) => a.fileUrl), "— via Ping!"].filter(Boolean).join("\n");
}
export const EMOJI_SET = EMOJIS;

// ── URL detection & link preview ─────────────────────────────────────────────

const URL_RE = /https?:\/\/[^\s<>"]+/g;

function extractUrls(text: string | null): string[] {
  if (!text) return [];
  return Array.from(new Set(text.match(URL_RE) ?? [])).slice(0, 3);
}

interface OGPreview {
  url: string;
  title: string | null;
  description: string | null;
  image: string | null;
  siteName: string | null;
}

const previewCache = new Map<string, OGPreview | null>();

function LinkPreviewCard({ url, dark }: { url: string; dark?: boolean }) {
  const [preview, setPreview] = useState<OGPreview | null | "loading">("loading");

  useEffect(() => {
    if (previewCache.has(url)) {
      setPreview(previewCache.get(url) ?? null);
      return;
    }
    let cancelled = false;
    api(`/api/link-preview?url=${encodeURIComponent(url)}`)
      .then((data) => {
        if (cancelled) return;
        const preview = data as OGPreview;
        // only show if at least title was found
        const result = preview.title ? preview : null;
        previewCache.set(url, result);
        setPreview(result);
      })
      .catch(() => {
        if (!cancelled) {
          previewCache.set(url, null);
          setPreview(null);
        }
      });
    return () => { cancelled = true; };
  }, [url]);

  if (preview === "loading" || preview === null) return null;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`flex gap-3 mt-1.5 rounded-lg border p-2.5 max-w-sm hover:opacity-90 transition ${
        dark
          ? "bg-primary/20 border-primary/30 text-white"
          : "bg-hover border-border text-textp"
      }`}
    >
      {preview.image && (
        <img
          src={preview.image}
          alt=""
          className="w-16 h-14 object-cover rounded shrink-0"
          onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
        />
      )}
      <div className="min-w-0">
        {preview.siteName && (
          <div className={`text-[10px] uppercase tracking-wide mb-0.5 ${dark ? "text-white/60" : "text-textm"}`}>
            {preview.siteName}
          </div>
        )}
        <div className={`text-sm font-semibold truncate ${dark ? "text-white" : "text-textp"}`}>
          {preview.title}
        </div>
        {preview.description && (
          <div className={`text-xs line-clamp-2 mt-0.5 ${dark ? "text-white/70" : "text-textm"}`}>
            {preview.description}
          </div>
        )}
      </div>
    </a>
  );
}