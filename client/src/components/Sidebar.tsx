import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chat";
import { useUIStore } from "../store/ui";
import { NewTopicModal } from "./NewTopicModal";
import { useModal } from "./Modal";
import type { SidebarItem } from "../types";
import { apiUrl } from "../lib/api";

// ── Helpers ────────────────────────────────────────────────────────────────────

function Avatar({
  name,
  avatarUrl,
  size = 28,
  online,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  online?: boolean;
}) {
  const colors = [
    "#E01E5A", "#ECB22E", "#2BAC76", "#1264A3",
    "#611f69", "#36C5F0", "#4A154B", "#FF612B", "#008080", "#7B2D8B",
  ];
  const color = colors[name.charCodeAt(0) % colors.length];
  const avatar = avatarUrl ? (
    <img
      src={apiUrl(avatarUrl)}
      alt={name}
      className="inline-block object-cover shrink-0 rounded"
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      className="inline-flex items-center justify-center text-white font-bold shrink-0 uppercase rounded"
      style={{ backgroundColor: color, width: size, height: size, fontSize: size * 0.44 }}
    >
      {name.charAt(0)}
    </span>
  );

  if (online === undefined) return avatar;

  return (
    <span className="relative shrink-0 inline-flex">
      {avatar}
      <span
        className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 ${
          online ? "bg-green-500" : "bg-white/30"
        }`}
        style={{ borderColor: "var(--color-sidebar-bg, #1A2540)" }}
      />
    </span>
  );
}

// Unread badge — red pill matching Slack style
function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="ml-auto shrink-0 bg-red-500 text-white text-[11px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none">
      {count > 99 ? "99+" : count}
    </span>
  );
}

// Section header — uppercase muted label + optional (+) button
function SectionHeader({
  label,
  onAdd,
  collapsed,
  onToggle,
}: {
  label: string;
  onAdd?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-3 pt-4 pb-1 group">
      <button
        onClick={onToggle}
        className="flex items-center gap-1 flex-1 text-left text-xs font-semibold uppercase tracking-wide text-white/50 hover:text-white/70 transition"
      >
        {onToggle && (
          <span className="text-[9px] mr-0.5 opacity-60">{collapsed ? "▶" : "▼"}</span>
        )}
        {label}
      </button>
      {onAdd && (
        <button
          onClick={onAdd}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition text-lg leading-none font-light"
          title={`Tambah ${label}`}
        >
          +
        </button>
      )}
    </div>
  );
}

// Single sidebar list item
function SbItem({
  icon,
  label,
  active,
  unread,
  unreadCount,
  onClick,
  indent,
}: {
  icon?: React.ReactNode;
  label: string;
  active: boolean;
  unread: boolean;
  unreadCount?: number;
  onClick: () => void;
  indent?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-2 px-3 py-2.5 mx-1 rounded-md text-left transition
        ${active
          ? "bg-[var(--color-brand,#2E46E0)] text-white font-semibold"
          : unread
            ? "text-white font-semibold hover:bg-white/8"
            : "text-white/60 hover:bg-white/5 hover:text-white/80"
        }
      `}
      style={{
        paddingLeft: indent ? "calc(0.75rem + 16px)" : undefined,
        width: "calc(100% - 8px)",
      }}
    >
      {icon && <span className="shrink-0 text-sm leading-none">{icon}</span>}
      <span className="flex-1 truncate text-sm">{label}</span>
      {unread && !active && unreadCount != null && unreadCount > 0 && (
        <UnreadBadge count={unreadCount} />
      )}
    </button>
  );
}

// ── Main Sidebar ───────────────────────────────────────────────────────────────

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
  const railView = useUIStore((s) => s.railView);
  const setAdminOpen = useUIStore((s) => s.setAdminOpen);
  const adminOpen = useUIStore((s) => s.adminOpen);
  const setProfileOpen = useUIStore((s) => s.setProfileOpen);

  const [filter, setFilter] = useState("");
  const [showNewTopic, setShowNewTopic] = useState(false);
  const [showNewDM, setShowNewDM] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const isAdminish =
    user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || user?.role === "MANAGER";

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

  const showTopics = railView === "home" || railView === "activity";
  const showDMs = railView === "dms";

  // Unread items for activity view
  const unreadItems: Array<{
    id: string; name: string | null; icon: string | null; unread: number; type: "TOPIC" | "DM";
  }> = [];
  if (railView === "activity") {
    (sidebar?.pinnedTop || []).forEach((c) => {
      if (c.unread > 0) unreadItems.push({ id: c.id, name: c.name, icon: c.icon, unread: c.unread, type: c.type as "TOPIC" | "DM" });
    });
    (sidebar?.level1 || []).forEach((c) => {
      if (c.unread > 0) unreadItems.push({ id: c.id, name: c.name, icon: c.icon, unread: c.unread, type: "TOPIC" });
      (c.subTopics || []).forEach((s) => {
        if (s.unread > 0) unreadItems.push({ id: s.id, name: s.name, icon: s.icon, unread: s.unread, type: "TOPIC" });
      });
    });
    (sidebar?.dms || []).forEach((d) => {
      if (d.unread > 0) unreadItems.push({ id: d.id, name: d.name, icon: null, unread: d.unread, type: "DM" });
    });
  }

  return (
    <div
      className="h-full flex flex-col select-none overflow-x-hidden w-full"
      style={{ background: "var(--color-sidebar-bg, #1A2540)", color: "var(--color-sidebar-text, rgba(255,255,255,0.7))" }}
    >
      {/* ── Search bar ── */}
      <div className="shrink-0 flex items-center gap-2 px-3 pt-3 pb-2">
        {/* App icon */}
        <div className="w-8 h-8 rounded-lg shrink-0 flex items-center justify-center font-black text-white text-sm"
          style={{ background: "linear-gradient(135deg, var(--color-brand, #2E46E0), #7c3aed)" }}>
          Pi
        </div>
        {/* Search input */}
        <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/10">
          <svg className="w-3.5 h-3.5 shrink-0 text-white/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={showDMs ? "Cari DM…" : "Cari channel…"}
            className="flex-1 bg-transparent text-sm text-white/70 placeholder:text-white/40 outline-none"
          />
          {filter && (
            <button onClick={() => setFilter("")} className="text-white/40 hover:text-white/70 transition text-xs">✕</button>
          )}
        </div>
      </div>

      {/* ── Scrollable nav list ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain" style={{ scrollbarWidth: "none" }}>

        {/* ─ Home / Topics view ─ */}
        {showTopics && railView !== "activity" && (
          <>
            {/* "Semua Pesan" quick link */}
            <div className="px-1 pt-1">
              <SbItem
                icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>}
                label="Semua Pesan"
                active={false}
                unread={false}
                onClick={() => setSearchActive(true)}
              />
            </div>

            {/* Pinned top / Unreads section */}
            {(sidebar?.pinnedTop || []).filter(matchItem).length > 0 && (
              <>
                <SectionHeader label="Unggulan" />
                <div className="px-1">
                  {(sidebar?.pinnedTop || []).filter(matchItem).map((item) => (
                    <SbItem
                      key={item.id}
                      icon={<span>{item.icon || "#"}</span>}
                      label={item.name || "Channel"}
                      active={activeId === item.id}
                      unread={item.unread > 0}
                      unreadCount={item.unread}
                      onClick={() => onOpen(item.id)}
                    />
                  ))}
                </div>
              </>
            )}

            {/* Channels section */}
            {(sidebar?.level1 || []).length > 0 ? (
              <>
                <SectionHeader
                  label="Channels"
                  collapsed={collapsed["channels"]}
                  onToggle={() => toggleCollapse("channels")}
                  onAdd={isAdminish ? () => setShowNewTopic(true) : undefined}
                />
                {!collapsed["channels"] && (
                  <div className="px-1">
                    {(sidebar?.level1 || []).filter(matchItem).map((lv) => (
                      <div key={lv.id}>
                        <SbItem
                          icon={<span className="text-white/40">#</span>}
                          label={lv.name || "channel"}
                          active={activeId === lv.id}
                          unread={lv.unread > 0}
                          unreadCount={lv.unread}
                          onClick={() => onOpen(lv.id)}
                        />
                        {(lv.subTopics || []).filter((s) => matchItem(s)).map((sub) => (
                          <SbItem
                            key={sub.id}
                            icon={<span className="text-white/30">#</span>}
                            label={sub.name || "sub-channel"}
                            active={activeId === sub.id}
                            unread={sub.unread > 0}
                            unreadCount={sub.unread}
                            onClick={() => onOpen(sub.id)}
                            indent
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : !sidebarLoading ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm text-white/40">Belum ada channel.</p>
                {isAdminish && (
                  <button
                    onClick={() => setShowNewTopic(true)}
                    className="mt-2 text-sm text-white/60 underline hover:text-white transition"
                  >
                    Buat channel pertama
                  </button>
                )}
              </div>
            ) : null}
          </>
        )}

        {/* ─ Activity view ─ */}
        {railView === "activity" && (
          <>
            {unreadItems.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="text-2xl mb-2 opacity-60">✓</div>
                <p className="text-sm font-medium text-white/80">Semua sudah dibaca</p>
                <p className="text-xs mt-1 text-white/40">Tidak ada notifikasi baru.</p>
              </div>
            ) : (
              <>
                <SectionHeader label="Belum Dibaca" />
                <div className="px-1">
                  {unreadItems.map((item) => (
                    <SbItem
                      key={item.id}
                      icon={<span>{item.type === "DM" ? "💬" : (item.icon || "#")}</span>}
                      label={item.name || "Direct Message"}
                      active={activeId === item.id}
                      unread={true}
                      unreadCount={item.unread}
                      onClick={() => onOpen(item.id)}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ─ DMs view ─ */}
        {showDMs && (
          <>
            <SectionHeader
              label="Direct Messages"
              onAdd={() => setShowNewDM(true)}
            />
            <div className="px-1">
              {(sidebar?.dms || []).filter(matchItem).length === 0 && !sidebarLoading ? (
                <div className="px-3 py-5 text-center">
                  <p className="text-sm text-white/40">Belum ada DM.</p>
                  <button
                    onClick={() => setShowNewDM(true)}
                    className="mt-2 text-sm text-white/60 underline hover:text-white transition"
                  >
                    Mulai percakapan baru
                  </button>
                </div>
              ) : (
                (sidebar?.dms || []).filter(matchItem).map((dm) => (
                  <button
                    key={dm.id}
                    onClick={() => onOpen(dm.id)}
                    className={`
                      w-full flex items-center gap-2.5 px-3 py-2.5 mx-1 rounded-md text-left transition
                      ${activeId === dm.id
                        ? "bg-[var(--color-brand,#2E46E0)] text-white font-semibold"
                        : dm.unread > 0
                          ? "text-white font-semibold hover:bg-white/8"
                          : "text-white/60 hover:bg-white/5 hover:text-white/80"
                      }
                    `}
                    style={{ width: "calc(100% - 8px)" }}
                  >
                    <Avatar
                      name={dm.name || "?"}
                      avatarUrl={null}
                      size={24}
                      online={dm.partnerId ? undefined : undefined}
                    />
                    <span className="flex-1 truncate text-sm">{dm.name || "Direct Message"}</span>
                    {dm.unread > 0 && activeId !== dm.id && <UnreadBadge count={dm.unread} />}
                  </button>
                ))
              )}
            </div>
          </>
        )}

        {/* Loading shimmer */}
        {sidebarLoading && (
          <div className="px-4 py-3 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 rounded-md bg-white/5 animate-pulse" />
            ))}
          </div>
        )}
      </div>

      {/* ── User footer — mobile only ── */}
      {user && (
        <div
          className="shrink-0 md:hidden flex items-center gap-3 px-3 py-3 border-t"
          style={{ borderColor: "rgba(255,255,255,0.1)" }}
        >
          <button
            onClick={() => { setProfileOpen(true); setChatOpen(false); }}
            className="flex items-center gap-2.5 flex-1 min-w-0 rounded-lg hover:bg-white/8 px-2 py-1.5 transition text-left"
            title="Profil saya"
          >
            <Avatar
              name={user.name}
              avatarUrl={user.avatarUrl}
              size={30}
              online={user.status === "online"}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-white truncate">{user.name}</div>
              <div className="text-xs text-white/50 truncate">
                {user.status === "online" ? "Online" : "Offline"}
              </div>
            </div>
          </button>
          {isAdminish && (
            <button
              onClick={() => setAdminOpen(!adminOpen)}
              title="Admin Dashboard"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition shrink-0 text-white/50 hover:text-white hover:bg-white/10 ${
                adminOpen ? "bg-white/15 text-white" : ""
              }`}
            >
              ⚙️
            </button>
          )}
        </div>
      )}

      {/* ── Admin button — desktop only ── */}
      {user && isAdminish && (
        <div
          className="shrink-0 hidden md:flex px-3 py-2.5 border-t"
          style={{ borderColor: "rgba(255,255,255,0.1)" }}
        >
          <button
            onClick={() => setAdminOpen(!adminOpen)}
            title="Admin Dashboard"
            className={`w-full flex items-center gap-2 px-3 h-8 rounded-md text-sm transition ${
              adminOpen
                ? "bg-white/10 text-white font-semibold"
                : "text-white/50 hover:bg-white/8 hover:text-white"
            }`}
          >
            <span>⚙️</span>
            <span>Admin</span>
          </button>
        </div>
      )}

      {showNewTopic && <NewTopicModal onClose={() => setShowNewTopic(false)} />}
      {showNewDM && <NewDMModal onClose={() => setShowNewDM(false)} onOpen={onOpen} />}
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
                <span
                  className="inline-flex items-center justify-center text-white font-bold shrink-0 uppercase rounded"
                  style={{ backgroundColor: u.status === "online" ? "#2BAC76" : "#868686", width: 32, height: 32, fontSize: 13 }}
                >
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
