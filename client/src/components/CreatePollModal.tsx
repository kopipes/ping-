import { useRef, useState } from "react";
import { api, apiBase, apiUrl, getAccessToken } from "../lib/api";
import imageCompression from "browser-image-compression";
import type { PollData } from "./PollCard";

interface PollOption {
  text: string;
  imageUrl: string | null;
  imagePreview: string | null;
  uploading: boolean;
}

export function CreatePollModal({
  conversationId,
  onClose,
  onCreate,
}: {
  conversationId: string;
  onClose: () => void;
  onCreate: (poll: PollData) => void;
}) {
  const [question, setQuestion] = useState("");
  const [isMultiVote, setIsMultiVote] = useState(false);
  const [options, setOptions] = useState<PollOption[]>([
    { text: "", imageUrl: null, imagePreview: null, uploading: false },
    { text: "", imageUrl: null, imagePreview: null, uploading: false },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const fileRefs = useRef<(HTMLInputElement | null)[]>([]);

  const addOption = () => {
    if (options.length >= 6) return;
    setOptions((o) => [...o, { text: "", imageUrl: null, imagePreview: null, uploading: false }]);
  };

  const removeOption = (i: number) => {
    if (options.length <= 2) return;
    setOptions((o) => o.filter((_, idx) => idx !== i));
  };

  const updateText = (i: number, text: string) => {
    setOptions((o) => o.map((opt, idx) => idx === i ? { ...opt, text } : opt));
  };

  const uploadImage = async (i: number, file: File) => {
    setOptions((o) => o.map((opt, idx) => idx === i ? { ...opt, uploading: true } : opt));
    try {
      const compressed = await imageCompression(file, { maxSizeMB: 1, maxWidthOrHeight: 800 });
      const preview = URL.createObjectURL(compressed);
      const formData = new FormData();
      formData.append("file", compressed, file.name);
      const token = getAccessToken();
      const res = await fetch(`${apiBase}/api/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await res.json();
      setOptions((o) => o.map((opt, idx) =>
        idx === i ? { ...opt, imageUrl: data.fileUrl, imagePreview: preview, uploading: false } : opt
      ));
    } catch {
      setOptions((o) => o.map((opt, idx) => idx === i ? { ...opt, uploading: false } : opt));
    }
  };

  const removeImage = (i: number) => {
    setOptions((o) => o.map((opt, idx) => idx === i ? { ...opt, imageUrl: null, imagePreview: null } : opt));
  };

  const submit = async () => {
    if (!question.trim()) return;
    const validOptions = options.filter((o) => o.text.trim() || o.imageUrl);
    if (validOptions.length < 2) return;
    setSubmitting(true);
    try {
      const poll = await api<PollData>(`/api/polls/${conversationId}`, {
        method: "POST",
        body: {
          question: question.trim(),
          isMultiVote,
          options: validOptions.map((o, i) => ({
            text: o.text.trim() || null,
            imageUrl: o.imageUrl,
            order: i,
          })),
        },
      });
      onCreate(poll);
      onClose();
    } catch { /* ignore */ } finally {
      setSubmitting(false);
    }
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
          <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-hover text-textm text-lg">✕</button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto slim-scroll">
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
            <div
              onClick={() => setIsMultiVote(!isMultiVote)}
              className="w-9 h-5 rounded-full transition relative"
              style={{ background: isMultiVote ? "var(--sl-accent)" : "var(--sl-line-strong)" }}>
              <div className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform"
                style={{ transform: isMultiVote ? "translateX(18px)" : "translateX(2px)" }} />
            </div>
            <span className="text-sm" style={{ color: "var(--sl-ink-soft)" }}>Pilih lebih dari 1 opsi</span>
          </label>

          {/* Options */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide mb-2 block"
              style={{ color: "var(--sl-ink-faint)" }}>Opsi ({options.length}/6)</label>
            <div className="space-y-2">
              {options.map((opt, i) => (
                <div key={i} className="rounded-xl border p-2.5 space-y-2"
                  style={{ background: "var(--sl-surface)", borderColor: "var(--sl-line-strong)" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold w-5 text-center shrink-0"
                      style={{ color: "var(--sl-ink-faint)" }}>{i + 1}</span>
                    <input
                      type="text"
                      className="flex-1 text-sm bg-transparent outline-none"
                      style={{ color: "var(--sl-ink)" }}
                      placeholder={`Opsi ${i + 1}${opt.imageUrl ? " (opsional)" : ""}`}
                      value={opt.text}
                      onChange={(e) => updateText(i, e.target.value)}
                    />
                    {/* Image upload button */}
                    <button
                      onClick={() => fileRefs.current[i]?.click()}
                      disabled={opt.uploading}
                      className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-hover transition text-sm"
                      style={{ color: "var(--sl-ink-faint)" }}
                      title="Tambah gambar">
                      {opt.uploading ? "⏳" : "🖼"}
                    </button>
                    <input ref={(el) => { fileRefs.current[i] = el; }} type="file" accept="image/*" className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage(i, f); e.target.value = ""; }} />
                    {options.length > 2 && (
                      <button onClick={() => removeOption(i)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-hover text-danger text-sm">
                        ✕
                      </button>
                    )}
                  </div>
                  {/* Image preview */}
                  {opt.imagePreview && (
                    <div className="relative">
                      <img src={opt.imagePreview} alt="" className="w-full h-24 object-cover rounded-lg" />
                      <button onClick={() => removeImage(i)}
                        className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs flex items-center justify-center">
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {options.length < 6 && (
              <button onClick={addOption}
                className="mt-2 w-full py-2 rounded-xl text-sm font-medium transition hover:opacity-80 border border-dashed"
                style={{ color: "var(--sl-accent)", borderColor: "var(--sl-accent)" }}>
                + Tambah opsi
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t flex justify-end gap-2"
          style={{ borderColor: "var(--sl-line-strong)" }}>
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-medium hover:bg-hover transition"
            style={{ color: "var(--sl-ink-soft)" }}>
            Batal
          </button>
          <button
            onClick={submit}
            disabled={submitting || !question.trim() || options.filter((o) => o.text.trim() || o.imageUrl).length < 2}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--sl-accent)" }}>
            {submitting ? "Membuat…" : "Buat Poll"}
          </button>
        </div>
      </div>
    </div>
  );
}
