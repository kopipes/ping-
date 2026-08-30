import { useEffect, useState } from "react";
import { useChatStore } from "../store/chat";
import { assetUrl } from "../store/chat";
import { FileIcon, LinkIcon } from "./icons";

type TypeFilter = "ALL" | "IMAGE" | "FILE" | "LINK";

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
                <a key={img.id} href={assetUrl(img.fileUrl)} target="_blank" rel="noreferrer" className="aspect-square rounded-lg overflow-hidden border border-border">
                  <img src={assetUrl(img.thumbnailUrl || img.fileUrl)} alt={img.fileName || ""} className="w-full h-full object-cover" loading="lazy" />
                </a>
              ))}
            </div>
          </section>
        )}

        {(type === "ALL" || type === "FILE") && files.length > 0 && (
          <section>
            <SectionTitle>Dokumen ({files.length})</SectionTitle>
            <div className="space-y-2">
              {files.map((f) => (
                <a key={f.id} href={assetUrl(f.fileUrl)} target="_blank" rel="noreferrer" className="flex items-center gap-3 card p-3">
                  <span className="text-texts"><FileIcon /></span>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-medium">{f.fileName}</div>
                    <div className="text-xs text-textm">{f.fileSize ? `${(f.fileSize / 1024).toFixed(0)} KB` : ""}</div>
                  </div>
                </a>
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