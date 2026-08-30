import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useChatStore } from "../store/chat";
import { useUIStore } from "../store/ui";
import { api } from "../lib/api";
import { buildShareText } from "./MessageBubble";
import { UserIcon } from "./icons";
import { assetUrl } from "../store/chat";
import type { Message, SidebarItem } from "../types";

export function ForwardModal() {
  const { t } = useTranslation();
  const target = useUIStore((s) => s.forwardTarget);
  const closeForward = useUIStore((s) => s.closeForward);
  const sidebar = useChatStore((s) => s.sidebar);
  const receiveMessage = useChatStore((s) => s.receiveMessage);

  const [note, setNote] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    setNote("");
    setSelectedId(null);
    setDone(false);
    setErr("");
  }, [target]);

  if (!target) return null;

  // Flatten conversations (exclude source)
  const items: SidebarItem[] = [];
  (sidebar?.pinnedTop || []).forEach((c) => items.push(c));
  (sidebar?.level1 || []).forEach((lv) => {
    items.push(lv);
    (lv.subTopics || []).forEach((s) => items.push(s));
  });
  (sidebar?.dms || []).forEach((c) => items.push(c));
  const targets = items.filter((c) => c.id !== target.sourceConversationId);

  const preview = target.message;

  const doForward = async () => {
    if (!selectedId) return;
    setSending(true);
    setErr("");
    try {
      const fwd = await api<Message>(`/api/messages/${preview.id}/forward`, {
        method: "POST",
        body: { conversationId: selectedId, note: note || undefined },
      });
      // tampilkan di state client supaya langsung terlihat bila dibuka
      receiveMessage(fwd);
      setDone(true);
      setTimeout(closeForward, 900);
    } catch (e: any) {
      setErr(e?.message || "Gagal meneruskan");
    } finally {
      setSending(false);
    }
  };

  const doExternal = async (kind: "native" | "whatsapp") => {
    const text = buildShareText(preview);
    if (kind === "native" && typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        setDone(true);
        return;
      } catch {
        /* user cancel */
      }
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl max-h-[88vh] flex flex-col fade-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <h3 className="font-bold text-textp">{t("forward.title")}</h3>
          <button onClick={closeForward} className="touch-btn !min-h-[36px] !min-w-[36px] h-9 w-9 rounded-full hover:bg-hover text-texts text-lg">✕</button>
        </div>

        {/* Preview */}
        <div className="shrink-0 px-4 pt-3">
          <PreviewCard message={preview} />
          <input
            className="input-base mt-2"
            placeholder={t("forward.notePlaceholder")}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {/* External share */}
        <div className="shrink-0 px-4 py-3 border-b border-border">
          <p className="text-[11px] font-semibold uppercase text-textm mb-2">{t("forward.external")}</p>
          <div className="flex gap-2">
            <button onClick={() => doExternal("whatsapp")} className="flex-1 h-10 rounded-xl bg-[#25D366] text-white font-semibold text-sm flex items-center justify-center gap-2">
              <WhatsAppGlyph /> {t("forward.whatsapp")}
            </button>
            <button onClick={() => doExternal("native")} className="flex-1 h-10 rounded-xl border border-border bg-white text-texts font-semibold text-sm">
              ↗ {t("forward.nativeShare")}
            </button>
          </div>
        </div>

        {/* In-app conversation picker */}
        <div className="flex-1 overflow-y-auto min-h-0">
          <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase text-textm">{t("forward.toConversation")}</p>
          <div className="px-2 pb-2">
            {targets.length === 0 ? (
              <p className="text-sm text-textm px-3 py-4">{t("forward.empty")}</p>
            ) : (
              targets.map((c) => {
                const selected = c.id === selectedId;
                return (
                  <button
                    key={c.id}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition ${
                      selected ? "bg-bubble border border-primary" : "hover:bg-hover border border-transparent"
                    }`}
                  >
                    {c.type === "DM" ? (
                      <span className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0"><UserIcon className="w-4 h-4" /></span>
                    ) : (
                      <span className="w-8 h-8 rounded-lg bg-white border border-border flex items-center justify-center text-lg shrink-0">{c.icon || "📁"}</span>
                    )}
                    <span className="flex-1 truncate text-[15px] font-medium">{c.name}</span>
                    {selected && <span className="text-primary text-lg">✓</span>}
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-border p-3">
          {err && <p className="text-danger text-sm mb-2">{err}</p>}
          {done ? (
            <div className="text-center text-success font-semibold text-sm py-2">✓ {t("forward.toasted")}</div>
          ) : (
            <button
              onClick={doForward}
              disabled={!selectedId || sending}
              className="w-full min-h-[44px] rounded-xl bg-primary text-white font-semibold hover:bg-primaryhover disabled:opacity-40"
            >
              {sending ? t("common.loading") : t("forward.forwardBtn")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewCard({ message }: { message: Message }) {
  const img = message.attachments?.find((a) => a.type === "IMAGE");
  const file = message.attachments?.find((a) => a.type === "FILE");
  return (
    <div className="rounded-xl bg-sidebar border border-border px-3 py-2">
      {message.content && <div className="text-sm whitespace-pre-wrap break-words">{message.content}</div>}
      {img && <img src={assetUrl(img.thumbnailUrl || img.fileUrl)} alt="" className="mt-1 rounded-lg max-h-32" />}
      {file && <div className="text-sm text-texts mt-1">📎 {file.fileName}</div>}
      <div className="text-[11px] text-textm mt-1">from {message.user?.name}</div>
    </div>
  );
}

function WhatsAppGlyph() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.52.149-.174.198-.298.297-.497.1-.198.05-.371-.025-.52-.074-.149-.668-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413Z" />
    </svg>
  );
}