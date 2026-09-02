import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../store/chat";
import { assetUrl } from "../store/chat";
import { MessageBubble, buildShareText } from "./MessageBubble";
import { useUIStore } from "../store/ui";
import { api } from "../lib/api";
import type { Message } from "../types";

export function PinnedTab({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const pinned = useChatStore((s) => s.pinned[conversationId]);
  const loadPinned = useChatStore((s) => s.loadPinned);
  const openForward = useUIStore((s) => s.openForward);

  useEffect(() => {
    loadPinned(conversationId);
  }, [conversationId, loadPinned]);

  const unpin = async (messageId: string, note?: string | null) => {
    try {
      await api(`/api/messages/${messageId}/pin`, { method: "DELETE" });
      loadPinned(conversationId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-3 no-scrollbar">
      {!pinned || pinned.length === 0 ? (
        <div className="h-full flex flex-col items-center justify-center text-textm gap-2">
          <span className="text-4xl">📌</span>
          <p className="text-sm">Belum ada pesan yang di-pin di chat ini.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {pinned.map((p) => (
            <div key={p.id} className="card p-3 border-l-4 border-amber-400">
              {p.note && <div className="text-sm font-semibold text-warning mb-1">{p.note}</div>}
              <div className="text-xs text-textm mb-1.5">
                Dipin oleh <span className="font-medium text-texts">{p.pinnedBy.name}</span> · {new Date(p.pinnedAt).toLocaleDateString()}
              </div>
              <PinnedBubble message={p.message} />
              <div className="flex gap-2 mt-2">
                <button
                  onClick={() => openForward({ message: p.message, sourceConversationId: conversationId, sourceName: null })}
                  className="text-xs text-primary font-medium px-2 py-1 rounded-lg hover:bg-bubble"
                >
                  ⤴️ {t("chat.forward")}
                </button>
                <button onClick={() => shareText(buildShareText(p.message))} className="text-xs text-primary font-medium px-2 py-1 rounded-lg hover:bg-bubble">
                  {t("chat.share")}
                </button>
                <button onClick={() => unpin(p.messageId, p.note)} className="text-xs text-danger font-medium px-2 py-1 rounded-lg hover:bg-red-50">
                  {t("chat.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PinnedBubble({ message }: { message: Message }) {
  const img = message.attachments?.find((a) => a.type === "IMAGE");
  return (
    <div className="rounded-xl bg-sidebar border border-border px-3 py-2">
      {message.content && <div className="whitespace-pre-wrap break-words">{message.content}</div>}
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