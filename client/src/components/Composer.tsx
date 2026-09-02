import { useRef, useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import imageCompression from "browser-image-compression";
import { api, apiUrl } from "../lib/api";
import { useChatStore } from "../store/chat";
import { useAuthStore } from "../store/auth";
import { useModal } from "./Modal";

// ── Formatting popup ──────────────────────────────────────────────────────────
interface FormatPopupProps {
  anchorRect: DOMRect;
  containerRect: DOMRect;
  onFormat: (syntax: string) => void;
}

function FormatPopup({ anchorRect, containerRect, onFormat }: FormatPopupProps) {
  const popupWidth = 148;
  const popupHeight = 34;
  const gap = 6;

  // Position above the selection, centered horizontally, clamped to container
  let left = anchorRect.left - containerRect.left + anchorRect.width / 2 - popupWidth / 2;
  left = Math.max(4, Math.min(left, containerRect.width - popupWidth - 4));
  let top = anchorRect.top - containerRect.top - popupHeight - gap;
  // If not enough room above, show below
  if (top < 0) top = anchorRect.bottom - containerRect.top + gap;

  return (
    <div
      onMouseDown={(e) => e.preventDefault()}
      style={{
        position: "absolute",
        left, top,
        width: popupWidth,
        height: popupHeight,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "0 4px",
        background: "var(--sl-ink, #22221D)",
        borderRadius: 8,
        boxShadow: "0 4px 16px rgba(0,0,0,0.22)",
        pointerEvents: "all",
      }}
    >
      {[
        { label: "B", title: "Bold (Ctrl+B)", syntax: "**", style: { fontWeight: 700, fontFamily: "inherit" } },
        { label: "I", title: "Italic (Ctrl+I)", syntax: "_",  style: { fontStyle: "italic" } },
        { label: "S", title: "Strikethrough", syntax: "~~", style: { textDecoration: "line-through" } },
        { label: "</>", title: "Inline code", syntax: "`",  style: { fontFamily: "monospace", fontSize: 11 } },
      ].map(({ label, title, syntax, style }) => (
        <button
          key={syntax}
          title={title}
          onMouseDown={(e) => { e.preventDefault(); onFormat(syntax); }}
          style={{
            flex: 1, height: 26,
            border: "none", borderRadius: 5, cursor: "pointer",
            background: "transparent",
            color: "rgba(255,255,255,0.85)",
            fontSize: 13,
            transition: "background 100ms",
            ...style,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.15)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Composer({
  conversationId,
  readOnly,
  parentId,
  replyTo,
  onCancelReply,
}: {
  conversationId: string;
  readOnly: boolean;
  parentId?: string | null;
  replyTo?: { name: string; content: string | null } | null;
  onCancelReply?: () => void;
}) {
  const { t } = useTranslation();
  const { toast, prompt } = useModal();
  const sendMessage = useChatStore((s) => s.sendMessage);
  const conversation = useChatStore((s) => s.conversation[conversationId]);
  const myId = useAuthStore((s) => s.user?.id);
  const [text, setText] = useState("");
  const [pending, setPending] = useState<PendingUpload[]>([]);
  const [uploading, setUploading] = useState(false);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [formatPopup, setFormatPopup] = useState<{ anchorRect: DOMRect; containerRect: DOMRect } | null>(null);

  // Show/hide formatting popup based on selection
  const checkSelection = useCallback(() => {
    const ta = textareaRef.current;
    const container = composerRef.current;
    if (!ta || !container) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    if (end > start) {
      setFormatPopup({ anchorRect: ta.getBoundingClientRect(), containerRect: container.getBoundingClientRect() });
    } else {
      setFormatPopup(null);
    }
  }, []);

  // Wrap selected text with markdown syntax
  const formatText = useCallback((syntax: string) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart ?? 0;
    const end = ta.selectionEnd ?? 0;
    if (end <= start) return;
    const selected = text.slice(start, end);
    const wrapped = `${syntax}${selected}${syntax}`;
    const newText = text.slice(0, start) + wrapped + text.slice(end);
    setText(newText);
    setFormatPopup(null);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + syntax.length, start + syntax.length + selected.length);
    }, 0);
  }, [text]);

  // H-10: memoize members array to avoid new array on every render
  const members = useMemo(
    () => (conversation?.members || []).filter((m) => m.user.id !== myId).map((m) => m.user),
    [conversation?.members, myId]
  );

  const mentionSuggestions = useMemo(
    () => mentionQuery !== null
      ? members.filter((m) => m.name.toLowerCase().startsWith(mentionQuery.toLowerCase()))
      : [],
    [members, mentionQuery]
  );

  interface PendingUpload {
    fileUrl: string;
    thumbnailUrl?: string | null;
    fileName: string;
    fileSize?: number | null;
    type: "IMAGE" | "FILE" | "LINK";
    linkMetadata?: string | null;
  }

  if (readOnly) {
    return (
      <div className="shrink-0 mx-4 mb-4 px-4 py-3 rounded-xl border border-border bg-hover text-center text-sm text-textm">
        🔒 {t("chat.placeholderReadOnly")}
      </div>
    );
  }

  const onPickFile = async (fileList: FileList | null) => {
    if (!fileList) return;
    setUploading(true);
    for (const file of Array.from(fileList)) {
      let uploadFile: File = file;
      if (file.type.startsWith("image/")) {
        try {
          uploadFile = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1600, useWebWorker: true });
        } catch {}
      }
      const form = new FormData();
      form.append("file", uploadFile, file.name);
      try {
        const res = await api<any>("/api/upload", { method: "POST", formData: form });
        setPending((p) => [...p, { fileUrl: res.fileUrl, thumbnailUrl: res.thumbnailUrl, fileName: res.fileName || file.name, fileSize: res.fileSize, type: res.type }]);
      } catch (e: any) { toast("Upload gagal: " + (e?.message || "")); }
    }
    setUploading(false);
  };

  const serialize = (p: PendingUpload) => ({
    type: p.type, fileUrl: p.fileUrl, thumbnailUrl: p.thumbnailUrl,
    fileName: p.fileName, fileSize: p.fileSize,
    linkMetadata: p.linkMetadata ? (() => { try { return JSON.parse(p.linkMetadata!); } catch { return null; } })() : undefined,
  });

  const send = () => {
    const content = text.trim();
    if (!content && pending.length === 0) return;
    sendMessage(conversationId, content || undefined, pending.map(serialize), parentId ?? null);
    setPending([]);
    setText("");
    onCancelReply?.();
    if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
  };

  const autoResize = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + "px";
    // Detect @mention trigger
    const cursor = e.target.selectionStart;
    const before = val.slice(0, cursor);
    const match = before.match(/@([\w\s]*)$/);
    if (match) {
      setMentionQuery(match[1]);
      setMentionIndex(0);
    } else {
      setMentionQuery(null);
    }
  };

  const insertMention = (name: string) => {
    const cursor = textareaRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, cursor);
    const after = text.slice(cursor);
    const replaced = before.replace(/@[\w\s]*$/, `@${name} `);
    setText(replaced + after);
    setMentionQuery(null);
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = replaced.length;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  };

  return (
    <div className="shrink-0 px-4 pb-4 pt-1" ref={composerRef} style={{ position: "relative" }}>
      {/* Formatting popup */}
      {formatPopup && (
        <FormatPopup
          anchorRect={formatPopup.anchorRect}
          containerRect={formatPopup.containerRect}
          onFormat={formatText}
        />
      )}
      {/* @ mention autocomplete dropdown */}
      {mentionSuggestions.length > 0 && (
        <div className="mb-1 bg-white border border-border rounded-xl shadow-md overflow-hidden">
          {mentionSuggestions.slice(0, 6).map((m, i) => (
            <button
              key={m.id}
              onMouseDown={(e) => { e.preventDefault(); insertMention(m.name); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                i === mentionIndex ? "bg-primary/10 text-primary" : "hover:bg-hover text-textp"
              }`}
            >
              <span className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                {m.name.charAt(0).toUpperCase()}
              </span>
              <span className="font-medium truncate">{m.name}</span>
            </button>
          ))}
        </div>
      )}
      <div className="composer-box">
        {/* Reply banner */}
        {replyTo && (
          <div className="flex items-center justify-between bg-hover border-b border-border px-3 py-1.5 text-sm">
            <span className="text-textm">Balas <span className="font-semibold text-textp">{replyTo.name}</span>: <span className="truncate">{replyTo.content?.slice(0, 60) ?? ""}</span></span>
            <button onClick={onCancelReply} className="text-textm hover:text-textp ml-2">✕</button>
          </div>
        )}

        {/* Attachment preview */}
        {pending.length > 0 && (
          <div className="flex gap-2 overflow-x-auto p-2 border-b border-border no-scrollbar">
            {pending.map((p, i) => (
              <div key={i} className="relative shrink-0">
                {p.type === "IMAGE" ? (
                  <img src={apiUrl(p.thumbnailUrl || p.fileUrl)} alt="" className="h-16 w-16 rounded object-cover border border-border" />
                ) : (
                  <div className="h-16 w-16 rounded border border-border bg-hover flex items-center justify-center text-xl">{p.type === "LINK" ? "🔗" : "📎"}</div>
                )}
                <button onClick={() => setPending(pending.filter((_, x) => x !== i))}
                  className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-danger text-white text-[10px] flex items-center justify-center">✕</button>
              </div>
            ))}
          </div>
        )}

        {/* Text area */}
        <div className="px-3 py-2">
          <textarea
            ref={textareaRef}
            className="w-full resize-none bg-transparent text-textp text-[15px] outline-none placeholder:text-textm leading-[1.46668]"
            style={{ minHeight: 22 }}
            rows={1}
            placeholder={t("chat.placeholder")}
            value={text}
            onChange={autoResize}
            onSelect={checkSelection}
            onMouseUp={checkSelection}
            onKeyUp={checkSelection}
            onBlur={() => setTimeout(() => setFormatPopup(null), 150)}
            onKeyDown={(e) => {
              // Ctrl/Cmd+B = bold, Ctrl/Cmd+I = italic
              if ((e.ctrlKey || e.metaKey) && e.key === "b") { e.preventDefault(); formatText("**"); return; }
              if ((e.ctrlKey || e.metaKey) && e.key === "i") { e.preventDefault(); formatText("_"); return; }
              if (mentionSuggestions.length > 0) {
                if (e.key === "ArrowDown") { e.preventDefault(); setMentionIndex((i) => Math.min(i + 1, mentionSuggestions.length - 1)); return; }
                if (e.key === "ArrowUp") { e.preventDefault(); setMentionIndex((i) => Math.max(i - 1, 0)); return; }
                if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionSuggestions[mentionIndex].name); return; }
                if (e.key === "Escape") { setMentionQuery(null); return; }
              }
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            onPaste={(e) => {
              const items = Array.from(e.clipboardData.items);
              const imageItems = items.filter((i) => i.kind === "file" && i.type.startsWith("image/"));
              if (imageItems.length === 0) return;
              e.preventDefault();
              const files = imageItems.map((i) => i.getAsFile()).filter(Boolean) as File[];
              const dt = new DataTransfer();
              files.forEach((f) => dt.items.add(f));
              onPickFile(dt.files);
            }}
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-2 pb-2 pt-0.5">
          {/* Attachment */}
          <ToolBtn title="Lampiran" onClick={() => fileRef.current?.click()}>
            {uploading ? <span className="text-xs text-primary font-bold">…</span> : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="m21.4 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            )}
          </ToolBtn>
          <ToolBtn title="Kirim link" onClick={async () => {
            const raw = await prompt({ title: "Tambah Link", placeholder: "https://...", confirmLabel: "Tambah" });
            if (!raw) return;
            const v = /^https?:\/\//i.test(raw) ? raw : "https://" + raw;
            setPending((p) => [...p, { fileUrl: v, type: "LINK", fileName: v }]);
          }}>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
          </ToolBtn>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Char hint */}
          {text.length > 0 && <span className="text-[11px] text-textm mr-1">{text.length}</span>}

          {/* Send */}
          <button
            onClick={send}
            disabled={!text.trim() && pending.length === 0}
            className={`flex items-center gap-1.5 px-3 h-8 rounded text-sm font-bold transition ${
              text.trim() || pending.length > 0
                ? "bg-primary text-white hover:bg-primaryhover"
                : "bg-hover text-textm cursor-not-allowed"
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M2 21 23 12 2 3v7l15 2-15 2z"/></svg>
            Kirim
          </button>
        </div>
      </div>

      <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.csv"
        className="hidden" onChange={(e) => { onPickFile(e.target.files); e.target.value = ""; }} />
    </div>
  );
}

function ToolBtn({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button title={title} onClick={onClick}
      className="w-8 h-8 flex items-center justify-center rounded text-textm hover:bg-hover hover:text-textp transition">
      {children}
    </button>
  );
}