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

function formatLastTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (msgDay.getTime() === today.getTime()) {
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  }
  if (msgDay.getTime() === yesterday.getTime()) return "Kemarin";
  // Within current week: show day name
  if (now.getTime() - d.getTime() < 7 * 86400000) {
    return d.toLocaleDateString("id-ID", { weekday: "short" });
  }
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
}

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
      className="inline-flex items-center justify-center font-bold shrink-0 uppercase"
      style={{
        border: "1px solid rgba(128,128,128,0.35)",
        background: "transparent",
        color: "var(--color-sidebar-text-active, rgba(255,255,255,0.9))",
        width: size, height: size, fontSize: size * 0.44,
        borderRadius: "var(--avatar-radius, 8px)",
      }}
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

// WhatsApp-style row: avatar | name+preview | timestamp+badge
function WaItem({
  avatarName,
  avatarUrl,
  avatarIcon,
  label,
  preview,
  previewSender,
  timestamp,
  active,
  unread,
  unreadCount,
  indent,
  collapseBtn,
  onClick,
}: {
  avatarName?: string;
  avatarUrl?: string | null;
  avatarIcon?: string;
  label: string;
  preview?: string | null;
  previewSender?: string | null;
  timestamp?: string | null;
  active: boolean;
  unread: boolean;
  unreadCount?: number;
  indent?: boolean;
  collapseBtn?: React.ReactNode;
  onClick: () => void;
}) {
  const textActive = active ? "#FFFFFF" : "var(--color-sidebar-text-active, #FFFFFF)";
  const textMuted = active ? "rgba(255,255,255,0.65)" : "var(--color-sidebar-text, rgba(255,255,255,0.5))";
  const previewText = preview
    ? (previewSender ? `${previewSender}: ${preview}` : preview)
    : null;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-2.5 px-2 py-2 text-left transition rounded-md"
      style={{
        paddingLeft: indent ? "calc(0.5rem + 32px)" : "0.5rem",
        background: active ? "var(--color-brand-600, #2E46E0)" : undefined,
      }}
    >
      {/* Collapse toggle for groups */}
      {collapseBtn}

      {/* Avatar / icon */}
      <div className="shrink-0">
        {avatarName ? (
          <Avatar name={avatarName} avatarUrl={avatarUrl} size={40} />
        ) : avatarIcon && (avatarIcon.startsWith("/") || avatarIcon.startsWith("http")) ? (
          <img src={apiUrl(avatarIcon)} alt="" className="rounded-md object-cover shrink-0" style={{ width: 40, height: 40 }} />
        ) : (
          <span
            className="inline-flex items-center justify-center text-xl shrink-0"
            style={{
              width: 40, height: 40,
              background: "transparent",
              border: "1px solid rgba(128,128,128,0.35)",
              color: "var(--color-sidebar-text-active, rgba(255,255,255,0.9))",
              borderRadius: "var(--avatar-radius, 8px)",
            }}
          >
            {avatarIcon || "#"}
          </span>
        )}
      </div>

      {/* Center: name + preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span
            className="truncate"
            style={{ color: textActive, fontWeight: unread || active ? 600 : 500, fontSize: indent ? "0.88em" : "1em" }}
          >
            {label}
          </span>
          {timestamp && (
            <span className="shrink-0 tabular-nums" style={{ color: unread ? (active ? "rgba(255,255,255,0.85)" : "var(--color-brand-400, #7B93FF)") : textMuted, fontSize: "0.72em" }}>
              {timestamp}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-1 mt-0.5">
          <span
            className="truncate leading-snug"
            style={{ color: textMuted, fontWeight: unread && !active ? 500 : 400, fontSize: "0.85em" }}
          >
            {previewText || "\u00A0"}
          </span>
          {(unreadCount ?? 0) > 0 && (
            <span
              className="shrink-0 font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none"
              style={{
                fontSize: "0.72em",
                background: active ? "rgba(255,255,255,0.9)" : "var(--color-brand-500, #3B5BFA)",
                color: active ? "var(--color-brand-600, #2E46E0)" : "#FFFFFF",
              }}
            >
              {(unreadCount ?? 0) > 99 ? "99+" : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
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
        className="flex items-center gap-1 flex-1 text-left text-xs font-semibold uppercase tracking-wide transition"
        style={{ color: "var(--sidebar-section-label, rgba(255,255,255,0.5))" }}
      >
        {onToggle && (
          <span className="text-[9px] mr-0.5 opacity-60">{collapsed ? "▶" : "▼"}</span>
        )}
        {label}
      </button>
      {onAdd && (
        <button
          onClick={onAdd}
          className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded flex items-center justify-center transition text-lg leading-none font-light"
          style={{ color: "var(--color-sidebar-text, rgba(255,255,255,0.5))" }}
          title={`Tambah ${label}`}
        >
          +
        </button>
      )}
    </div>
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
    lastMessageAt?: string | null; lastMessageText?: string | null; lastMessageSender?: string | null;
  }> = [];
  if (railView === "activity") {
    (sidebar?.pinnedTop || []).forEach((c) => {
      if (c.unread > 0) unreadItems.push({ id: c.id, name: c.name, icon: c.icon, unread: c.unread, type: c.type as "TOPIC" | "DM", lastMessageAt: c.lastMessageAt, lastMessageText: c.lastMessageText, lastMessageSender: c.lastMessageSender });
    });
    (sidebar?.level1 || []).forEach((c) => {
      if (c.unread > 0) unreadItems.push({ id: c.id, name: c.name, icon: c.icon, unread: c.unread, type: "TOPIC", lastMessageAt: c.lastMessageAt, lastMessageText: c.lastMessageText, lastMessageSender: c.lastMessageSender });
      (c.subTopics || []).forEach((s) => {
        if (s.unread > 0) unreadItems.push({ id: s.id, name: s.name, icon: s.icon, unread: s.unread, type: "TOPIC", lastMessageAt: s.lastMessageAt, lastMessageText: s.lastMessageText, lastMessageSender: s.lastMessageSender });
      });
    });
    (sidebar?.dms || []).forEach((d) => {
      if (d.unread > 0) unreadItems.push({ id: d.id, name: d.name, icon: null, unread: d.unread, type: "DM", lastMessageAt: d.lastMessageAt, lastMessageText: d.lastMessageText });
    });
  }

  return (
    <div
      className="h-full flex flex-col select-none overflow-x-hidden w-full"
      style={{ background: "var(--color-sidebar-bg, #1A2540)", color: "var(--color-sidebar-text, rgba(255,255,255,0.7))" }}
    >
      {/* ── Search bar ── */}
      <div className="shrink-0 flex items-center gap-2.5 px-3 pt-5 pb-4"
        style={{
          background: "var(--sidebar-header-bg, rgba(0,0,0,0.18))",
          borderBottom: "1px solid var(--sidebar-header-border, rgba(255,255,255,0.07))"
        }}>
        {/* App logo — only on mobile (desktop rail already has it) */}
        <div className="md:hidden shrink-0 w-8 h-8 rounded-lg overflow-hidden"
          style={{ background: "var(--color-rail-active-pill)", boxShadow: "0 1px 4px rgba(0,0,0,0.25)" }}>
          <img src="/logo.png" alt="Ping!" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        {/* Search input */}
        <div className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{ background: "var(--sidebar-input-bg, rgba(255,255,255,0.08))" }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
            style={{ color: "var(--sidebar-input-icon, rgba(255,255,255,0.35))", flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={showDMs ? "Cari DM…" : "Cari group…"}
            className="flex-1 bg-transparent text-sm placeholder:opacity-40 outline-none"
            style={{ color: "var(--color-sidebar-text-active, rgba(255,255,255,0.7))" }}
          />
          {filter && (
            <button onClick={() => setFilter("")}
              className="transition text-xs opacity-40 hover:opacity-70"
              style={{ color: "var(--color-sidebar-text-active, white)" }}>✕</button>
          )}
        </div>
        {/* Admin icon — mobile only, right of search */}
        {isAdminish && (
          <button
            onClick={() => setAdminOpen(!adminOpen)}
            title="Admin Dashboard"
            className={`md:hidden shrink-0 w-9 h-9 rounded-lg flex items-center justify-center transition text-lg ${adminOpen ? "opacity-100" : "opacity-50"}`}
            style={{
              background: adminOpen ? "var(--color-sidebar-active, rgba(255,255,255,0.12))" : undefined,
              color: "var(--color-sidebar-text-active, #FFFFFF)",
            }}
          >
            ⚙️
          </button>
        )}
      </div>

      {/* ── Scrollable nav list ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain" style={{ scrollbarWidth: "none" }}>

        {/* ─ Home / Topics view ─ */}
        {showTopics && railView !== "activity" && (
          <>
            {/* Pinned section */}
            {(sidebar?.pinnedTop || []).filter(matchItem).length > 0 && (
              <>
                <SectionHeader label="Pinned" />
                <div className="px-1">
                  {(sidebar?.pinnedTop || []).filter(matchItem).map((item) => (
                    <WaItem
                      key={item.id}
                      avatarIcon={item.icon || "#"}
                      label={item.name || "Group"}
                      preview={item.lastMessageText}
                      previewSender={item.lastMessageSender}
                      timestamp={formatLastTime(item.lastMessageAt)}
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
                  label="Groups"
                  collapsed={collapsed["channels"]}
                  onToggle={() => toggleCollapse("channels")}
                  onAdd={isAdminish ? () => setShowNewTopic(true) : undefined}
                />
                {!collapsed["channels"] && (
                  <div className="px-1">
                    {(sidebar?.level1 || []).filter(matchItem).map((lv) => (
                      <div key={lv.id}>
                        <WaItem
                          avatarIcon={lv.icon || "#"}
                          label={lv.name || "channel"}
                          preview={lv.lastMessageText}
                          previewSender={lv.lastMessageSender}
                          timestamp={formatLastTime(lv.lastMessageAt)}
                          active={activeId === lv.id}
                          unread={lv.unread > 0}
                          unreadCount={lv.unread}
                          collapseBtn={
                            (lv.subTopics?.length ?? 0) > 0 ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); toggleCollapse(`grp-${lv.id}`); }}
                                className="shrink-0 text-[9px] opacity-40 hover:opacity-70 w-3 text-left"
                                style={{ color: activeId === lv.id ? "#FFF" : "var(--color-sidebar-text-active, white)" }}
                              >
                                {collapsed[`grp-${lv.id}`] ? "▶" : "▼"}
                              </button>
                            ) : undefined
                          }
                          onClick={() => onOpen(lv.id)}
                        />
                        {/* Sub-topics */}
                        {!collapsed[`grp-${lv.id}`] && (lv.subTopics || []).filter((s) => matchItem(s)).map((sub) => (
                          <WaItem
                            key={sub.id}
                            avatarIcon={sub.icon || "#"}
                            label={sub.name || "sub-channel"}
                            preview={sub.lastMessageText}
                            previewSender={sub.lastMessageSender}
                            timestamp={formatLastTime(sub.lastMessageAt)}
                            active={activeId === sub.id}
                            unread={sub.unread > 0}
                            unreadCount={sub.unread}
                            indent
                            onClick={() => onOpen(sub.id)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : !sidebarLoading ? (
              <div className="px-4 py-6 text-center">
                <p className="text-sm" style={{ color: "var(--color-sidebar-text, rgba(255,255,255,0.4))" }}>Belum ada group.</p>
                {isAdminish && (
                  <button
                    onClick={() => setShowNewTopic(true)}
                    className="mt-2 text-sm underline transition"
                    style={{ color: "var(--color-sidebar-text, rgba(255,255,255,0.6))" }}
                  >
                    Buat group pertama
                  </button>
                )}
              </div>
            ) : null}

            {/* DMs section — also shown in home view */}
            {(sidebar?.dms || []).length > 0 && (
              <>
                <SectionHeader
                  label="Direct Messages"
                  collapsed={collapsed["home-dms"]}
                  onToggle={() => toggleCollapse("home-dms")}
                  onAdd={() => setShowNewDM(true)}
                />
                {!collapsed["home-dms"] && (
                  <div className="px-1">
                    {(sidebar?.dms || []).filter(matchItem).map((dm) => (
                      <WaItem
                        key={dm.id}
                        avatarName={dm.name || "?"}
                        label={dm.name || "Direct Message"}
                        preview={dm.lastMessageText}
                        timestamp={formatLastTime(dm.lastMessageAt)}
                        active={activeId === dm.id}
                        unread={dm.unread > 0}
                        unreadCount={dm.unread}
                        onClick={() => onOpen(dm.id)}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {/* ─ Activity view ─ */}
        {railView === "activity" && (
          <>
            {unreadItems.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="text-2xl mb-2 opacity-60">✓</div>
                <p className="text-sm font-medium" style={{ color: "var(--color-sidebar-text-active, rgba(255,255,255,0.8))" }}>Semua sudah dibaca</p>
                <p className="text-xs mt-1" style={{ color: "var(--color-sidebar-text, rgba(255,255,255,0.4))" }}>Tidak ada notifikasi baru.</p>
              </div>
            ) : (
              <>
                <SectionHeader label="Belum Dibaca" />
                <div className="px-1">
                  {unreadItems.map((item) => (
                    <WaItem
                      key={item.id}
                      avatarName={item.type === "DM" ? (item.name || "?") : undefined}
                      avatarIcon={item.type !== "DM" ? (item.icon || "#") : undefined}
                      label={item.name || "Direct Message"}
                      preview={item.lastMessageText}
                      previewSender={item.lastMessageSender}
                      timestamp={formatLastTime(item.lastMessageAt)}
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
                  <p className="text-sm" style={{ color: "var(--color-sidebar-text, rgba(255,255,255,0.4))" }}>Belum ada DM.</p>
                  <button
                    onClick={() => setShowNewDM(true)}
                    className="mt-2 text-sm underline transition"
                    style={{ color: "var(--color-sidebar-text, rgba(255,255,255,0.6))" }}
                  >
                    Mulai percakapan baru
                  </button>
                </div>
              ) : (
                (sidebar?.dms || []).filter(matchItem).map((dm) => (
                  <WaItem
                    key={dm.id}
                    avatarName={dm.name || "?"}
                    label={dm.name || "Direct Message"}
                    preview={dm.lastMessageText}
                    timestamp={formatLastTime(dm.lastMessageAt)}
                    active={activeId === dm.id}
                    unread={dm.unread > 0}
                    unreadCount={dm.unread}
                    onClick={() => onOpen(dm.id)}
                  />
                ))
              )}
            </div>
          </>
        )}

        {/* Loading shimmer */}
        {sidebarLoading && (
          <div className="px-4 py-3 space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-8 rounded-md animate-pulse" style={{ background: "var(--color-sidebar-hover, rgba(255,255,255,0.05))" }} />
            ))}
          </div>
        )}
      </div>

      {/* ── Admin button — desktop only ── */}
      {user && isAdminish && (
        <div
          className="shrink-0 hidden md:flex px-3 py-2.5 border-t"
          style={{ borderColor: "var(--sidebar-header-border, rgba(255,255,255,0.1))" }}
        >
          <button
            onClick={() => setAdminOpen(!adminOpen)}
            title="Admin Dashboard"
            className="w-full flex items-center gap-2 px-3 h-8 rounded-md text-sm transition"
            style={{
              background: adminOpen ? "var(--color-sidebar-active, rgba(255,255,255,0.10))" : undefined,
              color: adminOpen ? "var(--color-sidebar-text-active, #FFFFFF)" : "var(--color-sidebar-text, rgba(255,255,255,0.5))",
              fontWeight: adminOpen ? 600 : 400,
            }}
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
