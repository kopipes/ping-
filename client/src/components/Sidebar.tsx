import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chat";
import { useUIStore } from "../store/ui";
import { NewTopicModal } from "./NewTopicModal";
import { useModal } from "./Modal";
import type { SidebarData, SidebarItem } from "../types";
import { apiUrl } from "../lib/api";

function Avatar({ name, avatarUrl, size = 20 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const colors = [
    "#E01E5A","#ECB22E","#2BAC76","#1264A3","#611f69","#36C5F0",
    "#4A154B","#FF612B","#008080","#7B2D8B",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  if (avatarUrl) {
    return (
      <img src={apiUrl(avatarUrl)} alt={name}
        style={{ width: size, height: size, borderRadius: 4 }}
        className="inline-block object-cover shrink-0" />
    );
  }
  return (
    <span style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.52, borderRadius: 4 }}
      className="inline-flex items-center justify-center text-white font-bold shrink-0 uppercase">
      {name.charAt(0)}
    </span>
  );
}

function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="ml-auto shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-sb-white text-sb text-[11px] font-bold flex items-center justify-center">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const sidebar = useChatStore((s) => s.sidebar);
  const sidebarLoading = useChatStore((s) => s.sidebarLoading);
  const loadSidebar = useChatStore((s) => s.loadSidebar);
  const openConversation = useChatStore((s) => s.openConversation);
  const activeId = useChatStore((s) => s.activeId);
  const setChatOpen = useUIStore((s) => s.setChatOpen);
  const setSearchActive = useChatStore((s) => s.setSearchActive);

  const [filter, setFilter] = useState("");
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const isAdminish = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || user?.role === "MANAGER";
  const setAdminOpen = useUIStore((s) => s.setAdminOpen);
  const adminOpen = useUIStore((s) => s.adminOpen);
  const setProfileOpen = useUIStore((s) => s.setProfileOpen);
  const profileOpen = useUIStore((s) => s.profileOpen);
  const setMobileTab = useUIStore((s) => s.setMobileTab);

  useEffect(() => {
    if (!sidebar && !sidebarLoading) loadSidebar();
  }, [sidebar, sidebarLoading, loadSidebar]);

  const onOpen = (id: string) => {
    openConversation(id);
    setSearchActive(false);
    setChatOpen(true);
    setAdminOpen(false);
    setProfileOpen(false);
  };

  const toggleCollapse = (key: string) =>
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));

  const matchItem = (item: SidebarItem) => {
    const q = filter.toLowerCase();
    if (!q) return true;
    if ((item.name || "").toLowerCase().includes(q)) return true;
    return (item.subTopics || []).some((s) => (s.name || "").toLowerCase().includes(q));
  };

  return (
    <div className="h-full flex flex-col bg-sb text-sb-text select-none overflow-x-hidden w-full">
      {/* Workspace header */}
      <div className="shrink-0 px-4 py-3 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="w-6 h-6 rounded bg-sb-white/20 text-sb-white flex items-center justify-center text-xs font-bold">Pi</span>
          <span className="text-sb-white font-bold text-[15px]">Ping!</span>
        </div>
        {user && (
          <div className="flex items-center gap-2">
            <span className="relative">
              <Avatar name={user.name} size={28} />
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-sb" />
            </span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="shrink-0 px-3 py-2">
        <button
          onClick={() => { setSearchActive(true); setMobileTab("search"); setChatOpen(false); }}
          className="w-full h-7 flex items-center gap-2 px-2.5 rounded bg-sb-hover text-sb-text text-sm hover:bg-white/10 transition"
        >
          <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
          <span className="truncate">Cari Ping!</span>
        </button>
      </div>

      {/* Nav list */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden slim-scroll py-1 overscroll-contain">
        {sidebarLoading && !sidebar ? (
          <div className="px-4 space-y-2 pt-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-7 rounded skeleton opacity-30" />
            ))}
          </div>
        ) : (
          <>
            {/* Pinned system topics */}
            {(sidebar?.pinnedTop || []).filter(matchItem).map((c) => (
              <SbItem key={c.id} item={c} active={activeId === c.id} prefix="★" onOpen={onOpen} />
            ))}

            {/* Channels (Topics) */}
            {(sidebar?.level1 || []).some(matchItem) && (
              <div className="mt-3">
                <SbSection
                  label="Groups"
                  collapsed={collapsed["channels"]}
                  onToggle={() => toggleCollapse("channels")}
                  onAdd={isAdminish ? () => setShowNewTopic(true) : undefined}
                />
                {!collapsed["channels"] && (sidebar?.level1 || []).filter(matchItem).map((lv) => (
                  <div key={lv.id}>
                    <SbItem item={lv} active={activeId === lv.id} prefix="#" onOpen={onOpen} />
                    {lv.subTopics && lv.subTopics.filter((s) => matchItem(s)).map((sub) => (
                      <SbItem key={sub.id} item={sub} active={activeId === sub.id} prefix="  #" onOpen={onOpen} indent />
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Direct Messages */}
            <div className="mt-3">
              <SbSection
                label="Direct messages"
                collapsed={collapsed["dms"]}
                onToggle={() => toggleCollapse("dms")}
                onAdd={() => setShowNewDM(true)}
              />
              {!collapsed["dms"] && (sidebar?.dms || []).filter(matchItem).map((dm) => (
                <button
                  key={dm.id}
                  onClick={() => onOpen(dm.id)}
                  className={`sb-item w-full ${activeId === dm.id ? "active" : ""} ${dm.unread > 0 ? "unread" : ""}`}
                >
                    <Avatar name={dm.name || "?"} avatarUrl={dm.partnerId ? undefined : null} size={20} />
                  <span className="flex-1 truncate">{dm.name || "Direct Message"}</span>
                  {dm.unread > 0 && <UnreadBadge count={dm.unread} />}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* User footer */}
      {user && (
        <div className="shrink-0 border-t border-white/10 px-3 py-2 flex items-center gap-2">
          <button
            onClick={() => { setProfileOpen(true); setMobileTab("profile"); setChatOpen(false); }}
            className="flex items-center gap-2 flex-1 min-w-0 rounded hover:bg-white/10 px-1 py-1 transition text-left"
            title="Profil saya"
          >
            <span className="relative shrink-0">
              <Avatar name={user.name} avatarUrl={user.avatarUrl} size={28} />
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-sb ${user.status === "online" ? "bg-success" : "bg-textm"}`} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-sb-white truncate">{user.name}</div>
              <div className="text-[11px] text-sb-text truncate">{user.status === "online" ? "Online" : "Offline"}</div>
            </div>
          </button>
          {isAdminish && (
            <button
              onClick={() => setAdminOpen(!adminOpen)}
              title="Admin Dashboard"
              className={`w-7 h-7 rounded flex items-center justify-center transition shrink-0 ${
                adminOpen ? "bg-sb-active text-white" : "text-sb-text hover:text-sb-white hover:bg-white/10"
              }`}
            >
              ⚙️
            </button>
          )}
        </div>
      )}

      {showNewTopic && <NewTopicModal onClose={() => setShowNewTopic(false)} />}
      {showNewDM && <NewDMModal onClose={() => setShowNewDM(false)} onOpen={onOpen} />}
    </div>
  );
}

function SbItem({ item, active, prefix, onOpen, indent }: {
  item: SidebarItem; active: boolean; prefix: string; onOpen: (id: string) => void; indent?: boolean;
}) {
  const unread = item.unread > 0;
  return (
    <button
      onClick={() => onOpen(item.id)}
      className={`sb-item w-full ${active ? "active" : ""} ${unread && !active ? "unread" : ""}`}
      style={indent ? { paddingLeft: 28 } : undefined}
    >
      <span className="text-sb-text text-sm shrink-0">{prefix}</span>
      <span className="flex-1 truncate">{item.name}</span>
      {unread && !active && <UnreadBadge count={item.unread} />}
    </button>
  );
}

function SbSection({ label, collapsed, onToggle, onAdd }: {
  label: string; collapsed?: boolean; onToggle: () => void; onAdd?: () => void;
}) {
  return (
    <div className="flex items-center px-3 py-0.5 group">
      <button onClick={onToggle} className="flex items-center gap-1 flex-1 text-xs font-bold uppercase tracking-wide text-sb-text hover:text-sb-white transition">
        <span className="text-[10px]">{collapsed ? "▶" : "▼"}</span>
        {label}
      </button>
      {onAdd && (
        <button onClick={onAdd} className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-sb-text hover:text-sb-white hover:bg-white/10 transition text-base font-light">
          +
        </button>
      )}
    </div>
  );
}

// ── New DM Modal ───────────────────────────────────────────────────────────────
function NewDMModal({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const [users, setUsers] = useState<{ id: string; name: string; email: string; division: string | null; status: string }[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);
  const myId = useAuthStore((s) => s.user?.id);
  const loadSidebar = useChatStore((s) => s.loadSidebar);
  const { toast } = useModal();

  useEffect(() => {
    setLoading(true);
    import("../lib/api").then(({ api }) => {
      api<any[]>(`/api/users${q ? `?q=${encodeURIComponent(q)}` : ""}`)
        .then((d) => { setUsers(d.filter((u: any) => u.id !== myId)); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [q]);

  const startDM = async (userId: string) => {
    setStarting(userId);
    try {
      const { api } = await import("../lib/api");
      const res = await api<{ conversationId: string }>("/api/conversations", {
        method: "POST",
        body: { type: "DM", parentId: userId },
      });
      await loadSidebar();
      onOpen(res.conversationId);
      onClose();
    } catch (e: any) {
      toast(e?.message || "Gagal memulai DM");
    } finally {
      setStarting(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl fade-slide-up flex flex-col max-h-[70vh]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="font-bold text-textp">Pesan Langsung Baru</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-hover flex items-center justify-center text-textm">✕</button>
        </div>
        <div className="px-4 pt-3 pb-2">
          <input
            autoFocus
            className="input-base"
            placeholder="Cari nama atau email…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {loading ? (
            <div className="py-6 flex justify-center">
              <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : users.length === 0 ? (
            <p className="text-sm text-textm text-center py-6">Tidak ada user ditemukan</p>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                onClick={() => startDM(u.id)}
                disabled={starting === u.id}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-hover text-left transition disabled:opacity-50"
              >
                <span style={{ backgroundColor: u.status === "online" ? "#2BAC76" : "#868686", width: 32, height: 32, fontSize: 13, borderRadius: 4 }}
                  className="inline-flex items-center justify-center text-white font-bold shrink-0 uppercase">
                  {u.name.charAt(0)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-textp truncate">{u.name}</div>
                  <div className="text-xs text-textm truncate">{u.email}{u.division ? ` · ${u.division}` : ""}</div>
                </div>
                {u.status === "online" && <span className="text-[10px] text-success font-semibold shrink-0">● Online</span>}
                {starting === u.id && <span className="text-[10px] text-textm shrink-0">membuka…</span>}
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}