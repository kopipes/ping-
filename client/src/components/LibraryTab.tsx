import { useEffect, useState } from "react";
import { useChatStore } from "../store/chat";
import { assetUrl } from "../store/chat";
import { FileIcon, LinkIcon } from "./icons";

type TypeFilter = "ALL" | "IMAGE" | "FILE" | "LINK";

function downloadFile(url: string, fileName: string) {
  fetch(url)
    .then((r) => r.blob())
    .then((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = fileName;
      a.click();
      URL.revokeObjectURL(a.href);
    })
    .catch(() => window.open(url, "_blank", "noopener,noreferrer"));
}

function openImage(src: string) {
  const overlay = document.createElement("div");
  overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.92);z-index:99999;display:flex;align-items:center;justify-content:center;";
  const img = document.createElement("img");
  img.src = src;
  img.style.cssText = "max-width:90vw;max-height:85vh;object-fit:contain;border-radius:8px;display:block;";
  img.onclick = (e) => e.stopPropagation();
  const closeBtn = document.createElement("button");
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "position:absolute;top:16px;right:16px;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,0.2);border:none;color:white;font-size:18px;cursor:pointer;";
  closeBtn.onclick = (e) => { e.stopPropagation(); document.body.removeChild(overlay); };
  const dlBtn = document.createElement("button");
  dlBtn.textContent = "⬇ Download";
  dlBtn.style.cssText = "position:absolute;bottom:16px;right:16px;padding:8px 14px;border-radius:8px;background:rgba(255,255,255,0.2);border:none;color:white;font-size:13px;cursor:pointer;";
  dlBtn.onclick = (e) => { e.stopPropagation(); downloadFile(src, src.split("/").pop() || "image"); };
  overlay.appendChild(img);
  overlay.appendChild(closeBtn);
  overlay.appendChild(dlBtn);
  overlay.onclick = () => document.body.removeChild(overlay);
  document.body.appendChild(overlay);
  const keyHandler = (e: KeyboardEvent) => { if (e.key === "Escape") { document.body.removeChild(overlay); window.removeEventListener("keydown", keyHandler); } };
  window.addEventListener("keydown", keyHandler);
}

export function LibraryTab({ conversationId }: { conversationId: string }) {
  const library = useChatStore((s) => s.library[conversationId] || []);
  const loadLibrary = useChatStore((s) => s.loadLibrary);
  const [type, setType] = useState<TypeFilter>("ALL");

  useEffect(() => {
    loadLibrary(conversationId, type);
  }, [conversationId, type, loadLibrary]);

  const images = library.filter((a) => a.type === "IMAGE");
  const files = library.filter((a) => a.type === "FILE");
  const links = library.filter((a) => a.type === "LINK");

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar">
      {/* Filter */}
      <div className="sticky top-0 z-10 flex gap-2 px-3 py-2 bg-appbg border-b border-border">
        {(["ALL", "IMAGE", "FILE", "LINK"] as TypeFilter[]).map((ft) => (
          <button
            key={ft}
            onClick={() => setType(ft)}
            className={`px-3 h-8 rounded-full text-[13px] font-medium border transition ${
              type === ft ? "bg-primary text-white border-primary" : "bg-white border-border text-texts"
            }`}
          >
            {ft === "ALL" ? "Semua" : ft === "IMAGE" ? "Gambar" : ft === "FILE" ? "Dokumen" : "Link"}
          </button>
        ))}
      </div>

      <div className="p-3 space-y-5">
        {library.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-textm gap-2 py-16">
            <span className="text-4xl">🗂️</span>
            <p className="text-sm">Belum ada file/link di chat ini.</p>
          </div>
        )}

        {(type === "ALL" || type === "IMAGE") && images.length > 0 && (
          <section>
            <SectionTitle>Gambar ({images.length})</SectionTitle>
            <div className="grid grid-cols-3 gap-2">
              {images.map((img) => (
                <button key={img.id} onClick={() => openImage(assetUrl(img.fileUrl))}
                  className="aspect-square rounded-lg overflow-hidden border border-border focus:outline-none">
                  <img src={assetUrl(img.thumbnailUrl || img.fileUrl)} alt={img.fileName || ""} className="w-full h-full object-cover hover:opacity-90 transition" loading="lazy" />
                </button>
              ))}
            </div>
          </section>
        )}

        {(type === "ALL" || type === "FILE") && files.length > 0 && (
          <section>
            <SectionTitle>Dokumen ({files.length})</SectionTitle>
            <div className="space-y-2">
              {files.map((f) => (
                <button key={f.id} onClick={() => downloadFile(assetUrl(f.fileUrl), f.fileName || f.fileUrl.split("/").pop() || "file")}
                  className="w-full flex items-center gap-3 card p-3 text-left hover:bg-hover transition">
                  <span className="text-texts"><FileIcon /></span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{f.fileName}</div>
                    <div className="text-xs text-textm">{f.fileSize ? `${(f.fileSize / 1024).toFixed(0)} KB` : ""}</div>
                  </div>
                  <span className="text-xs text-textm shrink-0">⬇</span>
                </button>
              ))}
            </div>
          </section>
        )}

        {(type === "ALL" || type === "LINK") && links.length > 0 && (
          <section>
            <SectionTitle>Link ({links.length})</SectionTitle>
            <div className="space-y-2">
              {links.map((l) => {
                const meta = (() => { try { return l.linkMetadata ? JSON.parse(l.linkMetadata) : null; } catch { return null; } })();
                return (
                  <a key={l.id} href={l.fileUrl} target="_blank" rel="noreferrer" className="card p-3 flex items-center gap-3">
                    <span className="text-primary"><LinkIcon /></span>
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium">{meta?.title || l.fileUrl}</div>
                      <div className="truncate text-xs text-textm">{l.fileUrl}</div>
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-sm font-bold text-textp mb-2">{children}</h4>;
}