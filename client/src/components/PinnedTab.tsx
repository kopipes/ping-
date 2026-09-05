import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore, Task } from "../store/chat";
import { assetUrl } from "../store/chat";
import { buildShareText } from "./MessageBubble";
import { useUIStore } from "../store/ui";
import { useAuthStore } from "../store/auth";
import { api, apiUrl } from "../lib/api";
import { useModal } from "./Modal";
import type { Message } from "../types";

export function PinnedTab({
  conversationId,
  onOpenThread,
}: {
  conversationId: string;
  onOpenThread?: (m: Message) => void;
}) {
  const { t } = useTranslation();
  const pinned = useChatStore((s) => s.pinned[conversationId]);
  const loadPinned = useChatStore((s) => s.loadPinned);
  const tasks = useChatStore((s) => s.tasks[conversationId] || []);
  const loadTasks = useChatStore((s) => s.loadTasks);
  const receiveTask = useChatStore((s) => s.receiveTask);
  const removeTask = useChatStore((s) => s.removeTask);
  const openForward = useUIStore((s) => s.openForward);
  const myId = useAuthStore((s) => s.user?.id);
  const { prompt } = useModal();
  // Get all loaded messages for this conversation — find ones with threads
  const allMessages = useChatStore((s) => s.messages[conversationId] || []);
  const threadedMessages = allMessages.filter((m) => !m.parentId && m.replyCount > 0);

  useEffect(() => {
    loadPinned(conversationId);
    loadTasks(conversationId);
  }, [conversationId, loadPinned, loadTasks]);

  const unpin = async (messageId: string, scope?: string) => {
    try {
      const qs = scope === "personal" ? "?scope=personal" : "";
      await api(`/api/messages/${messageId}/pin${qs}`, { method: "DELETE" });
      loadPinned(conversationId);
    } catch { /* ignore */ }
  };

  const completeTask = async (task: Task) => {
    const note = await prompt({
      title: "Selesaikan Task",
      message: `"${task.content}"`,
      placeholder: "Tulis catatan penyelesaian… (opsional)",
      confirmLabel: "Selesai",
    });
    if (note === null) return; // cancelled
    try {
      const updated = await api<Task>(`/api/tasks/${task.id}/done`, {
        method: "PATCH",
        body: { note: note.trim() || undefined },
      });
      receiveTask(updated);
    } catch {}
  };

  const deleteTask = async (task: Task) => {
    try {
      await api(`/api/tasks/${task.id}`, { method: "DELETE" });
      removeTask(conversationId, task.id);
    } catch {}
  };

  const hasTasks = tasks.length > 0;
  const hasPinned = pinned && pinned.length > 0;
  const hasThreads = threadedMessages.length > 0;

  if (!hasTasks && !hasPinned && !hasThreads) {
    return (
      <div className="flex-1 overflow-y-auto p-3 no-scrollbar">
        <div className="h-full flex flex-col items-center justify-center text-textm gap-2">
          <span className="text-4xl">📌</span>
          <p className="text-sm">Belum ada pin, task, atau thread di chat ini.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-3 no-scrollbar space-y-4">

      {/* ── Tasks section ── */}
      {hasTasks && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-500">📋</span>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--sl-ink-faint)" }}>
              Tasks ({tasks.length})
            </span>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 overflow-hidden divide-y divide-amber-100">
            {tasks.map((task) => (
              <div key={task.id} className="flex items-start gap-2.5 px-3 py-2.5 group">
                <button
                  onClick={() => completeTask(task)}
                  className="shrink-0 w-5 h-5 mt-0.5 rounded border-2 border-amber-400 hover:border-green-500 hover:bg-green-50 transition flex items-center justify-center"
                  title="Tandai selesai"
                >
                  <span className="text-[10px] text-transparent group-hover:text-green-500">✓</span>
                </button>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug break-words" style={{ color: "var(--sl-ink, #22221D)" }}>{task.content}</p>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    <span className="text-xs text-gray-400">oleh {task.createdBy.name}</span>
                    {task.assignee && (
                      <span className="flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 border border-amber-200 rounded-full px-2 py-0.5">
                        {task.assignee.avatarUrl
                          ? <img src={apiUrl(task.assignee.avatarUrl)} alt="" className="w-3.5 h-3.5 rounded-full object-cover" />
                          : <span className="w-3.5 h-3.5 rounded-full bg-amber-400 text-white flex items-center justify-center text-[8px] font-bold">{task.assignee.name.charAt(0)}</span>
                        }
                        {task.assignee.name}
                      </span>
                    )}
                  </div>
                </div>
                {task.createdById === myId && (
                  <button onClick={() => deleteTask(task)}
                    className="shrink-0 opacity-0 group-hover:opacity-100 w-5 h-5 flex items-center justify-center text-gray-400 hover:text-red-500 transition text-xs"
                    title="Hapus task">✕</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Threads section ── */}
      {hasThreads && onOpenThread && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span>🧵</span>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--sl-ink-faint)" }}>
              Threads ({threadedMessages.length})
            </span>
          </div>
          <div className="space-y-2">
            {threadedMessages.map((m) => (
              <button
                key={m.id}
                onClick={() => onOpenThread(m)}
                className="w-full text-left rounded-xl border p-3 transition hover:opacity-80"
                style={{ background: "var(--sl-surface)", borderColor: "var(--sl-line-strong)" }}
              >
                <div className="flex items-center gap-2 mb-1">
                  {m.user.avatarUrl
                    ? <img src={apiUrl(m.user.avatarUrl)} alt="" className="w-5 h-5 rounded-full object-cover" />
                    : <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[8px] font-bold uppercase"
                        style={{ background: "var(--sl-accent)" }}>{m.user.name.charAt(0)}</span>
                  }
                  <span className="text-xs font-semibold" style={{ color: "var(--sl-ink)" }}>{m.user.name}</span>
                  <span className="text-[10px] ml-auto" style={{ color: "var(--sl-ink-fainter)" }}>
                    {new Date(m.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" })}
                  </span>
                </div>
                {m.content && (
                  <p className="text-sm truncate" style={{ color: "var(--sl-ink-soft)" }}>{m.content}</p>
                )}
                <div className="flex items-center gap-1 mt-1.5">
                  <span className="text-xs font-medium" style={{ color: "var(--sl-accent)" }}>
                    🧵 {m.replyCount} balasan
                  </span>
                  <span className="text-[10px]" style={{ color: "var(--sl-ink-fainter)" }}>· klik untuk buka</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Pinned messages section ── */}
      {hasPinned && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-amber-500">📌</span>
            <span className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--sl-ink-faint)" }}>
              Pin ({pinned!.length})
            </span>
          </div>
          <div className="space-y-2">
            {pinned!.map((p) => (
              <div key={p.id} className={`card p-3 border-l-4 ${(p as any).scope === "personal" ? "border-blue-400" : "border-amber-400"}`}>
                {/* Scope badge */}
                <div className="flex items-center gap-1.5 mb-1">
                  {(p as any).scope === "personal" ? (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(59,130,246,0.12)", color: "#3B82F6" }}>
                      Hanya Saya
                    </span>
                  ) : (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "var(--sl-accent-soft)", color: "var(--sl-accent)" }}>
                      Group
                    </span>
                  )}
                  {p.note && <span className="text-sm font-semibold text-warning">{p.note}</span>}
                </div>
                <div className="text-xs text-textm mb-1.5">
                  Dipin oleh <span className="font-medium text-texts">{p.pinnedBy.name}</span> · {new Date(p.pinnedAt).toLocaleDateString()}
                </div>
                <PinnedBubble message={p.message} />
                <div className="flex gap-2 mt-2 flex-wrap">
                  <button
                    onClick={() => openForward({ message: p.message, sourceConversationId: conversationId, sourceName: null })}
                    className="text-xs text-primary font-medium px-2 py-1 rounded-lg hover:bg-hover"
                  >
                    ⤴️ {t("chat.forward")}
                  </button>
                  <button onClick={() => shareText(buildShareText(p.message))} className="text-xs text-primary font-medium px-2 py-1 rounded-lg hover:bg-hover">
                    {t("chat.share")}
                  </button>
                  {onOpenThread && p.message.replyCount > 0 && (
                    <button onClick={() => onOpenThread(p.message)} className="text-xs font-medium px-2 py-1 rounded-lg hover:bg-hover"
                      style={{ color: "var(--sl-accent)" }}>
                      🧵 {p.message.replyCount} balasan
                    </button>
                  )}
                  <button onClick={() => unpin(p.message.id, (p as any).scope)} className="text-xs text-danger font-medium px-2 py-1 rounded-lg hover:bg-hover">
                    {t("chat.delete")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PinnedBubble({ message }: { message: Message }) {
  const img = message.attachments?.find((a) => a.type === "IMAGE");
  return (
    <div className="rounded-xl bg-hover border border-border px-3 py-2">
      {message.content && <div className="text-[15px] whitespace-pre-wrap break-words">{message.content}</div>}
      {img && <img src={assetUrl(img.thumbnailUrl || img.fileUrl)} alt="" className="mt-1 rounded-lg max-h-40" />}
      <div className="text-[11px] text-textm mt-1">{message.user?.name} · {new Date(message.createdAt).toLocaleString()}</div>
    </div>
  );
}

async function shareText(text: string) {
  if (typeof navigator.share === "function") {
    try { await navigator.share({ text }); return; } catch {}
  }
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
}
