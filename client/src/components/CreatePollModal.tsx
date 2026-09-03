import { useRef, useState } from "react";
import { api, apiBase, apiUrl, getAccessToken } from "../lib/api";
import imageCompression from "browser-image-compression";
import type { PollData } from "./PollCard";

// ── Text poll option ──────────────────────────────────────────────────────────
interface TextOption {
  text: string;
}

// ── Image poll option ─────────────────────────────────────────────────────────
interface ImageOption {
  fileUrl: string;   // server path e.g. /files/chats/xxx.jpg
  preview: string;   // object URL for display
  label: string;     // optional caption
}

type PollMode = "text" | "image";

// ── Upload helper ─────────────────────────────────────────────────────────────
async function uploadFile(file: File): Promise<string> {
  const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 1200 });
  const formData = new FormData();
  formData.append("file", compressed, file.name);
  const token = getAccessToken();
  const res = await fetch(`${apiBase}/api/upload`, {
    method: "POST",
    body: formData,
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("Upload failed");
  const data = await res.json();
  return data.fileUrl as string;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CreatePollModal({
  conversationId,
  onClose,
  onCreate,
}: {
  conversationId: string;
  onClose: () => void;
  onCreate: (poll: PollData) => void;
}) {
  const [mode, setMode] = useState<PollMode>("text");
  const [question, setQuestion] = useState("");
  const [isMultiVote, setIsMultiVote] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Text mode state
  const [textOptions, setTextOptions] = useState<TextOption[]>([
    { text: "" }, { text: "" },
  ]);

  // Image mode state
  const [imageOptions, setImageOptions] = useState<ImageOption[]>([]);
  const [uploading, setUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── Text mode handlers ──────────────────────────────────────────────────────
  const addTextOption = () => {
    if (textOptions.length >= 6) return;
    setTextOptions((o) => [...o, { text: "" }]);
  };
  const removeTextOption = (i: number) => {
    if (textOptions.length <= 2) return;
    setTextOptions((o) => o.filter((_, idx) => idx !== i));
  };
  const updateTextOption = (i: number, text: string) =>
    setTextOptions((o) => o.map((opt, idx) => idx === i ? { ...opt, text } : opt));

  // ── Image mode handlers ─────────────────────────────────────────────────────
  const pickImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const remaining = 6 - imageOptions.length;
    const toProcess = Array.from(files).slice(0, remaining);
    setUploading(true);
    try {
      const newOptions = await Promise.all(
        toProcess.map(async (file) => {
          const preview = URL.createObjectURL(file);
          const fileUrl = await uploadFile(file);
          return { fileUrl, preview, label: "" };
        })
      );
      setImageOptions((prev) => [...prev, ...newOptions]);
    } catch { /* ignore failed uploads */ }
    finally { setUploading(false); }
  };

  const removeImage = (i: number) =>
    setImageOptions((o) => o.filter((_, idx) => idx !== i));

  const updateLabel = (i: number, label: string) =>
    setImageOptions((o) => o.map((opt, idx) => idx === i ? { ...opt, label } : opt));

  // ── Submit ──────────────────────────────────────────────────────────────────
  const canSubmit = (() => {
    if (!question.trim()) return false;
    if (mode === "text") {
      const valid = textOptions.filter((o) => o.text.trim());
      return valid.length >= 2;
    } else {
      return imageOptions.length >= 2;
    }
  })();

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      const options = mode === "text"
        ? textOptions
            .filter((o) => o.text.trim())
            .map((o, i) => ({ text: o.text.trim(), imageUrl: null, order: i }))
        : imageOptions
            .map((o, i) => ({ text: o.label.trim() || null, imageUrl: o.fileUrl, order: i }));

      const poll = await api<PollData>(`/api/polls/${conversationId}`, {
        method: "POST",
        body: { question: question.trim(), isMultiVote, options },
      });
      onCreate(poll);
      onClose();
    } catch { /* ignore */ }
    finally { setSubmitting(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl shadow-lg overflow-hidden fade-slide-up"
        style={{ background: "var(--sl-bg)", border: "1px solid var(--sl-line-strong)" }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: "var(--sl-line-strong)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--sl-ink)" }}>Buat Poll</h2>
          <button onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-hover text-textm text-lg">✕</button>
        </div>

        <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto slim-scroll">

          {/* Mode toggle */}
          <div className="flex gap-2">
            {(["text", "image"] as PollMode[]).map((m) => (
              <button key={m}
                onClick={() => setMode(m)}
                className="flex-1 py-2 rounded-xl text-sm font-semibold transition"
                style={{
                  background: mode === m ? "var(--sl-accent)" : "var(--sl-surface)",
                  color: mode === m ? "#fff" : "var(--sl-ink-soft)",
                  border: `1.5px solid ${mode === m ? "var(--sl-accent)" : "var(--sl-line-strong)"}`,
                }}>
                {m === "text" ? "📝 Teks" : "🖼 Gambar"}
              </button>
            ))}
          </div>

          {/* Question */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide mb-1.5 block"
              style={{ color: "var(--sl-ink-faint)" }}>Pertanyaan</label>
            <textarea
              className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none border"
              style={{ background: "var(--sl-surface)", color: "var(--sl-ink)", borderColor: "var(--sl-line-strong)" }}
              rows={2}
              placeholder="Tulis pertanyaan poll..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
            />
          </div>

          {/* Multi-vote toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <div onClick={() => setIsMultiVote(!isMultiVote)}
              className="w-9 h-5 rounded-full transition relative"
              style={{ background: isMultiVote ? "var(--sl-accent)" : "var(--sl-line-strong)" }}>
              <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: isMultiVote ? "translateX(18px)" : "translateX(2px)" }} />
            </div>
            <span className="text-sm" style={{ color: "var(--sl-ink-soft)" }}>Pilih lebih dari 1 opsi</span>
          </label>

          {/* ── TEXT MODE ─────────────────────────────────────────── */}
          {mode === "text" && (
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide mb-2 block"
                style={{ color: "var(--sl-ink-faint)" }}>Opsi ({textOptions.length}/6)</label>
              <div className="space-y-2">
                {textOptions.map((opt, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-xl border px-3 py-2"
                    style={{ background: "var(--sl-surface)", borderColor: "var(--sl-line-strong)" }}>
                    <span className="text-xs font-bold w-4 shrink-0 text-center"
                      style={{ color: "var(--sl-ink-faint)" }}>{i + 1}</span>
                    <input type="text"
                      className="flex-1 text-sm bg-transparent outline-none"
                      style={{ color: "var(--sl-ink)" }}
                      placeholder={`Opsi ${i + 1}`}
                      value={opt.text}
                      onChange={(e) => updateTextOption(i, e.target.value)}
                    />
                    {textOptions.length > 2 && (
                      <button onClick={() => removeTextOption(i)}
                        className="w-6 h-6 flex items-center justify-center rounded hover:bg-hover text-danger text-xs">✕</button>
                    )}
                  </div>
                ))}
              </div>
              {textOptions.length < 6 && (
                <button onClick={addTextOption}
                  className="mt-2 w-full py-2 rounded-xl text-sm font-medium transition hover:opacity-80 border border-dashed"
                  style={{ color: "var(--sl-accent)", borderColor: "var(--sl-accent)" }}>
                  + Tambah opsi
                </button>
              )}
            </div>
          )}

          {/* ── IMAGE MODE ────────────────────────────────────────── */}
          {mode === "image" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--sl-ink-faint)" }}>
                  Gambar ({imageOptions.length}/6)
                </label>
                {imageOptions.length < 6 && (
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    disabled={uploading}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition hover:opacity-80 disabled:opacity-50"
                    style={{ background: "var(--sl-accent)", color: "#fff" }}>
                    {uploading ? "⏳ Mengupload…" : "＋ Pilih Gambar"}
                  </button>
                )}
                <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { pickImages(e.target.files); e.target.value = ""; }} />
              </div>

              {imageOptions.length === 0 ? (
                <button
                  onClick={() => imageInputRef.current?.click()}
                  disabled={uploading}
                  className="w-full py-8 rounded-xl border-2 border-dashed flex flex-col items-center gap-2 transition hover:opacity-80 disabled:opacity-50"
                  style={{ borderColor: "var(--sl-line-strong)", color: "var(--sl-ink-faint)" }}>
                  <span className="text-3xl">🖼</span>
                  <span className="text-sm font-medium">Pilih 2–6 gambar sekaligus</span>
                  <span className="text-xs">Setiap gambar akan jadi satu opsi poll</span>
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {imageOptions.map((opt, i) => (
                    <div key={i} className="rounded-xl overflow-hidden border"
                      style={{ borderColor: "var(--sl-line-strong)" }}>
                      <div className="relative">
                        <img src={opt.preview} alt=""
                          className="w-full object-cover" style={{ height: 100 }} />
                        <button onClick={() => removeImage(i)}
                          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white text-xs flex items-center justify-center hover:bg-red-500 transition">
                          ✕
                        </button>
                        <span className="absolute bottom-1 left-1 text-[10px] font-bold text-white bg-black/50 rounded px-1">
                          {i + 1}
                        </span>
                      </div>
                      <input
                        type="text"
                        className="w-full text-xs px-2 py-1.5 bg-transparent outline-none border-t"
                        style={{ color: "var(--sl-ink)", borderColor: "var(--sl-line)" }}
                        placeholder="Label (opsional)"
                        value={opt.label}
                        onChange={(e) => updateLabel(i, e.target.value)}
                      />
                    </div>
                  ))}
                  {imageOptions.length < 6 && (
                    <button
                      onClick={() => imageInputRef.current?.click()}
                      disabled={uploading}
                      className="rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1 transition hover:opacity-70 disabled:opacity-50"
                      style={{ height: 126, borderColor: "var(--sl-line-strong)", color: "var(--sl-ink-faint)" }}>
                      <span className="text-2xl">＋</span>
                      <span className="text-xs">Tambah</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex justify-end gap-2"
          style={{ borderColor: "var(--sl-line-strong)" }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-hover transition"
            style={{ color: "var(--sl-ink-soft)" }}>
            Batal
          </button>
          <button onClick={submit}
            disabled={!canSubmit || submitting || uploading}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--sl-accent)" }}>
            {submitting ? "Membuat…" : "Buat Poll"}
          </button>
        </div>
      </div>
    </div>
  );
}
