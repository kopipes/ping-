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
      className={`w-full flex items-center gap-2 px-3 py-2.5 mx-1 rounded-md text-left transition ${
        active ? "font-semibold" : unread ? "font-semibold" : ""
      }`}
      style={{
        paddingLeft: indent ? "calc(0.75rem + 16px)" : undefined,
        width: "calc(100% - 8px)",
        background: active ? "var(--color-brand-600, #2E46E0)" : undefined,
        color: active
          ? "#FFFFFF"
          : unread
          ? "var(--color-sidebar-text-active, #FFFFFF)"
          : "var(--color-sidebar-text, rgba(255,255,255,0.6))",
      }}
    >
      {icon && <span className="shrink-0 text-base leading-none">{icon}</span>}
      <span className="flex-1 truncate text-base">{label}</span>
      {unread && unreadCount != null && unreadCount > 0 && (
        <span className={`ml-auto shrink-0 text-[11px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none ${
          active ? "bg-white text-primary" : "bg-red-500 text-white"
        }`}>
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
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

            {/* Pinned section */}
            {(sidebar?.pinnedTop || []).filter(matchItem).length > 0 && (
              <>
                <SectionHeader label="Pinned" />
                <div className="px-1">
                  {(sidebar?.pinnedTop || []).filter(matchItem).map((item) => (
                    <button
                      key={item.id}
                      onClick={() => onOpen(item.id)}
                      className="w-full flex items-start gap-1.5 px-3 py-1.5 mx-1 rounded-md text-left transition"
                      style={{
                        width: "calc(100% - 8px)",
                        background: activeId === item.id ? "var(--color-brand-600, #2E46E0)" : undefined,
                      }}
                    >
                      <span className="text-sm shrink-0 mt-0.5">{item.icon || "#"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-sm font-medium" style={{
                            color: activeId === item.id ? "#FFFFFF" : "var(--color-sidebar-text-active, white)",
                            fontWeight: item.unread > 0 ? 600 : 500,
                          }}>{item.name || "Group"}</span>
                          {item.lastMessageAt && (
                            <span className="text-[10px] shrink-0" style={{
                              color: activeId === item.id ? "rgba(255,255,255,0.7)" : "var(--color-sidebar-text, rgba(255,255,255,0.45))",
                            }}>{formatLastTime(item.lastMessageAt)}</span>
                          )}
                        </div>
                        <div className="flex justify-end mt-0.5 h-4">
                          {item.unread > 0 && (
                            <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none bg-red-500 text-white">
                              {item.unread > 99 ? "99+" : item.unread}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
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
                        {/* Group header — click to open, arrow to collapse */}
                        <button
                          onClick={() => onOpen(lv.id)}
                          className="w-full flex items-start gap-1.5 px-3 py-1.5 mx-1 rounded-md text-left transition"
                          style={{
                            width: "calc(100% - 8px)",
                            background: activeId === lv.id ? "var(--color-brand-600, #2E46E0)" : undefined,
                          }}
                        >
                          {/* Collapse toggle embedded in icon area */}
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleCollapse(`grp-${lv.id}`); }}
                            className="shrink-0 mt-0.5 text-[9px] opacity-40 w-4 text-left"
                            style={{ color: "var(--color-sidebar-text-active, white)" }}
                          >
                            {collapsed[`grp-${lv.id}`] ? "▶" : "▼"}
                          </button>
                          <span className="text-sm shrink-0 mt-0.5 -ml-1">{lv.icon || "#"}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <span className="truncate text-sm font-medium" style={{
                                color: activeId === lv.id ? "#FFFFFF" : "var(--color-sidebar-text-active, white)",
                                fontWeight: lv.unread > 0 ? 600 : 500,
                              }}>
                                {lv.name || "channel"}
                              </span>
                              {lv.lastMessageAt && (
                                <span className="text-[10px] shrink-0" style={{
                                  color: activeId === lv.id ? "rgba(255,255,255,0.7)" : "var(--color-sidebar-text, rgba(255,255,255,0.45))",
                                }}>{formatLastTime(lv.lastMessageAt)}</span>
                              )}
                            </div>
                            <div className="flex justify-end mt-0.5 h-4">
                              {lv.unread > 0 && (
                                <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none bg-red-500 text-white">
                                  {lv.unread > 99 ? "99+" : lv.unread}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                        {/* Sub-topics */}
                        {!collapsed[`grp-${lv.id}`] && (lv.subTopics || []).filter((s) => matchItem(s)).map((sub) => (
                          <div key={sub.id} className="pl-5">
                            <button
                              onClick={() => onOpen(sub.id)}
                              className="w-full flex items-start gap-1.5 px-3 py-1.5 rounded-md text-left transition"
                              style={{
                                background: activeId === sub.id ? "var(--color-brand-600, #2E46E0)" : undefined,
                              }}
                            >
                              <span className="text-sm shrink-0 mt-0.5">{sub.icon || "#"}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className="truncate text-sm" style={{
                                    color: activeId === sub.id ? "#FFFFFF" : sub.unread > 0 ? "var(--color-sidebar-text-active, white)" : "var(--color-sidebar-text, rgba(255,255,255,0.6))",
                                    fontWeight: sub.unread > 0 ? 600 : 400,
                                  }}>{sub.name || "sub-channel"}</span>
                                  {sub.lastMessageAt && (
                                    <span className="text-[10px] shrink-0" style={{
                                      color: activeId === sub.id ? "rgba(255,255,255,0.7)" : "var(--color-sidebar-text, rgba(255,255,255,0.45))",
                                    }}>{formatLastTime(sub.lastMessageAt)}</span>
                                  )}
                                </div>
                                <div className="flex justify-end mt-0.5 h-4">
                                  {sub.unread > 0 && (
                                    <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none bg-red-500 text-white">
                                      {sub.unread > 99 ? "99+" : sub.unread}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          </div>
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
                      <button
                        key={dm.id}
                        onClick={() => onOpen(dm.id)}
                        className="w-full flex items-center gap-2.5 px-3 py-2 mx-1 rounded-md text-left transition"
                        style={{
                          width: "calc(100% - 8px)",
                          background: activeId === dm.id ? "var(--color-brand-600, #2E46E0)" : undefined,
                        }}
                      >
                        <Avatar name={dm.name || "?"} avatarUrl={null} size={20} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate text-sm font-medium" style={{
                              color: activeId === dm.id ? "#FFFFFF" : "var(--color-sidebar-text-active, #FFFFFF)",
                            }}>{dm.name || "Direct Message"}</span>
                            {dm.lastMessageAt && (
                              <span className="text-[10px] shrink-0" style={{
                                color: activeId === dm.id ? "rgba(255,255,255,0.7)" : "var(--color-sidebar-text, rgba(255,255,255,0.45))",
                              }}>{formatLastTime(dm.lastMessageAt)}</span>
                            )}
                          </div>
                          <div className="flex justify-end mt-0.5 h-4">
                            {dm.unread > 0 && (
                              <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none bg-red-500 text-white">
                                {dm.unread > 99 ? "99+" : dm.unread}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
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
                    <SbItem
                      key={item.id}
                      icon={item.type === "DM" ? "💬" : (item.icon || "#")}
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
                  <button
                    key={dm.id}
                    onClick={() => onOpen(dm.id)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 mx-1 rounded-md text-left transition font-semibold"
                    style={{
                      width: "calc(100% - 8px)",
                      background: activeId === dm.id ? "var(--color-brand-600, #2E46E0)" : undefined,
                      color: activeId === dm.id
                        ? "#FFFFFF"
                        : dm.unread > 0
                        ? "var(--color-sidebar-text-active, #FFFFFF)"
                        : "var(--color-sidebar-text, rgba(255,255,255,0.6))",
                      fontWeight: dm.unread > 0 || activeId === dm.id ? 600 : 400,
                    }}
                  >
                    <Avatar
                      name={dm.name || "?"}
                      avatarUrl={null}
                      size={32}
                      online={dm.partnerId ? undefined : undefined}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="truncate text-sm font-medium" style={{
                          color: activeId === dm.id ? "#FFFFFF" : "var(--color-sidebar-text-active, #FFFFFF)",
                        }}>{dm.name || "Direct Message"}</span>
                        {dm.lastMessageAt && (
                          <span className="text-[10px] shrink-0" style={{
                            color: activeId === dm.id ? "rgba(255,255,255,0.7)" : "var(--color-sidebar-text, rgba(255,255,255,0.45))",
                          }}>{formatLastTime(dm.lastMessageAt)}</span>
                        )}
                      </div>
                      <div className="flex justify-end mt-0.5 h-4">
                        {dm.unread > 0 && (
                          <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none bg-red-500 text-white">
                            {dm.unread > 99 ? "99+" : dm.unread}
                          </span>
                        )}
                      </div>
                    </div>
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
              <div key={i} className="h-8 rounded-md animate-pulse" style={{ background: "var(--color-sidebar-hover, rgba(255,255,255,0.05))" }} />
            ))}
          </div>
        )}
      </div>

      {/* ── User footer — mobile only ── */}
      {user && (
        <div
          className="shrink-0 md:hidden flex items-center gap-3 px-3 py-3 border-t"
          style={{ borderColor: "var(--sidebar-header-border, rgba(255,255,255,0.1))" }}
        >
          <button
            onClick={() => { setProfileOpen(true); setChatOpen(false); }}
            className="flex items-center gap-2.5 flex-1 min-w-0 rounded-lg px-2 py-1.5 transition text-left"
            title="Profil saya"
          >
            <Avatar
              name={user.name}
              avatarUrl={user.avatarUrl}
              size={30}
              online={user.status === "online"}
            />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: "var(--color-sidebar-text-active, #FFFFFF)" }}>{user.name}</div>
              <div className="text-xs truncate" style={{ color: "var(--color-sidebar-text, rgba(255,255,255,0.5))" }}>
                {user.status === "online" ? "Online" : "Offline"}
              </div>
            </div>
          </button>
          {isAdminish && (
            <button
              onClick={() => setAdminOpen(!adminOpen)}
              title="Admin Dashboard"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition shrink-0 ${adminOpen ? "opacity-100" : "opacity-50"}`}
              style={{ color: "var(--color-sidebar-text-active, #FFFFFF)" }}
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
