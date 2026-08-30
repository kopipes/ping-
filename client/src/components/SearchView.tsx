import { useEffect, useRef, useState } from "react";
import { useChatStore } from "../store/chat";
import { useUIStore } from "../store/ui";
import { BackIcon, FileIcon } from "./icons";
import type { SearchResult } from "../types";

type QTab = "all" | "messages" | "files" | "links";

export function SearchView() {
  const search = useChatStore((s) => s.search);
  const searchResult = useChatStore((s) => s.searchResult);
  const searchLoading = useChatStore((s) => s.searchLoading);
  const setSearchActive = useChatStore((s) => s.setSearchActive);
  const openConversation = useChatStore((s) => s.openConversation);
  const setChatOpen = useUIStore((s) => s.setChatOpen);
  const setMobileTab = useUIStore((s) => s.setMobileTab);

  const [q, setQ] = useState("");
  const [tab, setTab] = useState<QTab>("all");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { if (q.trim()) search(q); }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [q, search]);

  const openConv = (id: string) => {
    openConversation(id);
    setSearchActive(false);
    setChatOpen(true);
    setMobileTab("list");
  };

  const tabs: { key: QTab; label: string }[] = [
    { key: "all",      label: "Semua" },
    { key: "messages", label: "Pesan" },
    { key: "files",    label: "File" },
    { key: "links",    label: "Link" },
  ];

  // Flatten all results for "all" tab
  const allResults = searchResult
    ? [
        ...(searchResult.topics || []).map((t) => ({ ...t, _type: "topic" as const })),
        ...(searchResult.messages || []).map((m) => ({ ...m, _type: "message" as const })),
        ...(searchResult.files || []).map((f) => ({ ...f, _type: "file" as const })),
        ...(searchResult.links || []).map((l) => ({ ...l, _type: "link" as const })),
      ]
    : [];

  const showTopics = (tab === "all" || tab === "messages") && (searchResult?.topics?.length || 0) > 0;
  const messageResults = tab === "all" || tab === "messages" ? (searchResult?.messages || []) : [];
  const fileResults = tab === "all" || tab === "files" ? (searchResult?.files || []) : [];
  const linkResults = tab === "all" || tab === "links" ? (searchResult?.links || []) : [];

  const totalResults = (searchResult?.topics?.length || 0) + (searchResult?.messages?.length || 0)
    + (searchResult?.files?.length || 0) + (searchResult?.links?.length || 0);

  return (
    <div className="h-full flex flex-col bg-appbg">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-b border-border bg-white">
        <button
          onClick={() => { setSearchActive(false); setChatOpen(false); setMobileTab("list"); }}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-hover text-textm transition">
          <BackIcon className="w-5 h-5" />
        </button>
        <div className="flex-1 flex items-center gap-2 h-10 px-3 rounded-lg bg-hover border border-border focus-within:border-primary transition">
          <svg className="w-4 h-4 text-textm shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <input
            className="flex-1 bg-transparent outline-none text-textp placeholder:text-textm"
            placeholder="Cari pesan, file, link, atau group…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          {q && (
            <button onClick={() => setQ("")} className="text-textm hover:text-textp text-sm">✕</button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-border bg-white">
        {tabs.map((tb) => (
          <button key={tb.key} onClick={() => setTab(tb.key)}
            className={`flex-1 h-10 text-sm font-medium transition border-b-2 ${tab === tb.key ? "text-primary border-primary" : "text-textm border-transparent"}`}>
            {tb.label}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto slim-scroll">
        {!q.trim() && (
          <div className="py-16 text-center text-textm text-sm">Ketik kata kunci untuk mencari</div>
        )}
        {q.trim() && searchLoading && (
          <div className="py-12 flex justify-center">
            <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {q.trim() && !searchLoading && searchResult && totalResults === 0 && (
          <div className="py-16 text-center text-textm text-sm">
            Tidak ada hasil untuk "<span className="font-semibold text-textp">{q}</span>"
          </div>
        )}
        {q.trim() && !searchLoading && searchResult && totalResults > 0 && (
          <div className="p-3 space-y-4">
            {/* Groups/Topics */}
            {showTopics && (
              <section>
                <SectionHeader label="Group" count={searchResult.topics.length} />
                {searchResult.topics.map((tp) => (
                  <button key={tp.id} onClick={() => openConv(tp.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-hover text-left transition">
                    <span className="text-xl shrink-0">{tp.icon || "📁"}</span>
                    <span className="flex-1 font-medium text-textp truncate">{tp.name}</span>
                    <span className="text-xs text-textm shrink-0">{tp.type === "DM" ? "DM" : "Group"}</span>
                  </button>
                ))}
              </section>
            )}

            {/* Messages */}
            {messageResults.length > 0 && (
              <section>
                <SectionHeader label="Pesan" count={messageResults.length} />
                {messageResults.map((r) => <ResultItem key={r.id} r={r} onOpen={() => openConv(r.conversationId)} />)}
              </section>
            )}

            {/* Files */}
            {fileResults.length > 0 && (
              <section>
                <SectionHeader label="File" count={fileResults.length} />
                {fileResults.map((r) => <ResultItem key={r.id} r={r} onOpen={() => openConv(r.conversationId)} />)}
              </section>
            )}

            {/* Links */}
            {linkResults.length > 0 && (
              <section>
                <SectionHeader label="Link" count={linkResults.length} />
                {linkResults.map((r) => <ResultItem key={r.id} r={r} onOpen={() => openConv(r.conversationId)} />)}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 px-3 pb-1 mb-1">
      <span className="text-xs font-bold uppercase tracking-wide text-textm">{label}</span>
      <span className="text-xs text-textm">({count})</span>
    </div>
  );
}

function ResultItem({ r, onOpen }: { r: SearchResult & { _type?: string }; onOpen: () => void }) {
  const file = r.attachments?.find((a) => a.type === "FILE");
  const link = r.attachments?.find((a) => a.type === "LINK");
  return (
    <button onClick={onOpen} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-hover transition mb-0.5">
      <div className="flex items-center gap-1.5 text-xs text-textm mb-0.5">
        <span className="font-semibold text-primary truncate max-w-[120px]"># {r.conversationName || "chat"}</span>
        <span>·</span>
        <span>{r.user?.name}</span>
        <span>·</span>
        <span>{new Date(r.createdAt).toLocaleDateString()}</span>
      </div>
      {r.content && (
        <div className="text-sm text-textp line-clamp-2">{r.content}</div>
      )}
      {!r.content && file && (
        <div className="flex items-center gap-1.5 text-sm text-textp">
          <FileIcon className="w-4 h-4 text-textm shrink-0" />
          <span className="truncate">{file.fileName || "File"}</span>
        </div>
      )}
      {!r.content && !file && link && (
        <div className="text-sm text-primary truncate">{link.fileUrl}</div>
      )}
    </button>
  );
}