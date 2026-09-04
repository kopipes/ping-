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
  // Use WIB (UTC+7) for date comparisons
  const toWIBDate = (dt: Date) => {
    const wib = new Date(dt.getTime() + 7 * 60 * 60 * 1000);
    return `${wib.getUTCFullYear()}-${wib.getUTCMonth()}-${wib.getUTCDate()}`;
  };
  const dDate = toWIBDate(d);
  const todayDate = toWIBDate(now);
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayDate = toWIBDate(yesterday);

  if (dDate === todayDate) {
    return d.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Jakarta" });
  }
  if (dDate === yesterdayDate) return "Kemarin";
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
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
  const avatar = avatarUrl ? (
    <img
      src={apiUrl(avatarUrl)}
      alt={name}
      className="inline-block object-cover shrink-0"
      style={{ width: size, height: size, borderRadius: "var(--avatar-radius, 50%)" }}
    />
  ) : (
    <span
      className="inline-flex items-center justify-center font-bold shrink-0 uppercase"
      style={{
        background: "var(--sl-accent, #3E7368)",
        color: "#FFFFFF",
        width: size, height: size, fontSize: size * 0.4,
        borderRadius: "var(--avatar-radius, 50%)",
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
          online ? "bg-green-500" : "bg-gray-300"
        }`}
        style={{ borderColor: "var(--color-sidebar-bg, var(--sl-bg, #F7F6F1))" }}
      />
    </span>
  );
}

// Studio Ledger row: tile | name+preview | timestamp+badge
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
  pinned,
  collapseBtn,
  online,
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
  pinned?: boolean;
  collapseBtn?: React.ReactNode;
  online?: boolean;
  onClick: () => void;
}) {
  const tileSize = indent ? 34 : 44;
  const previewText = preview
    ? (previewSender ? `${previewSender}: ${preview}` : preview)
    : null;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center text-left transition"
      style={{
        gap: 13,
        paddingTop: "var(--sl-row-y, 11px)",
        paddingBottom: "var(--sl-row-y, 11px)",
        paddingLeft: indent ? `calc(28px + var(--sl-indent, 20px))` : "var(--space-5, 16px)",
        paddingRight: "var(--space-5, 16px)",
        borderBottom: "1px solid var(--sl-line, rgba(0,0,0,0.06))",
        borderLeft: pinned ? "2.5px solid var(--sl-accent, #3E7368)" : "2.5px solid transparent",
        background: active ? "var(--sl-accent-soft, #E6F0EE)" : undefined,
      }}
    >
      {/* Collapse toggle for groups */}
      {collapseBtn}

      {/* Tile / Avatar */}
      <div className="shrink-0 relative">
        {avatarName ? (
          <Avatar name={avatarName} avatarUrl={avatarUrl} size={tileSize} />
        ) : avatarIcon && (avatarIcon.startsWith("/") || avatarIcon.startsWith("http")) ? (
          <img src={apiUrl(avatarIcon)} alt="" className="object-cover shrink-0"
            style={{ width: tileSize, height: tileSize, borderRadius: "var(--sl-radius-tile, 10px)" }} />
        ) : (
          <span
            className="inline-flex items-center justify-center shrink-0"
            style={{
              width: tileSize, height: tileSize,
              borderRadius: "var(--sl-radius-tile, 10px)",
              background: "var(--sl-accent-soft, #E6F0EE)",
              color: "var(--sl-accent, #3E7368)",
              fontSize: indent ? 16 : 20,
            }}
          >
            {avatarIcon || "#"}
          </span>
        )}
        {/* Online dot — DMs only */}
        {online !== undefined && (
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 ${online ? "bg-green-500" : "bg-gray-300"}`}
            style={{ borderColor: "var(--color-sidebar-bg, var(--sl-bg, #F7F6F1))" }}
          />
        )}
      </div>

      {/* Text block */}
      <div className="flex-1 min-w-0">
        {/* Name + timestamp */}
        <div className="flex items-baseline justify-between gap-2">
          <span
            className="truncate"
            style={{
              fontFamily: "var(--font-display, 'Space Grotesk', sans-serif)",
              fontSize: "14.5px",
              fontWeight: unread || active ? 600 : 600,
              color: active
                ? "var(--sl-accent, #3E7368)"
                : "var(--sl-ink, #1A1814)",
            }}
          >
            {label}
          </span>
          {timestamp && (
            <span style={{
              fontSize: 11,
              flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
              color: unread
                ? "var(--sl-accent, #3E7368)"
                : "var(--sl-ink-fainter, #A09C93)",
            }}>
              {timestamp}
            </span>
          )}
        </div>
        {/* Preview + badge */}
        <div className="flex items-center justify-between gap-2 mt-0.5">
          <span
            className="truncate"
            style={{
              fontSize: "12.5px",
              color: unread
                ? "var(--sl-ink-soft, #3D3B36)"
                : "var(--sl-ink-faint, #726E66)",
              fontWeight: unread ? 500 : 400,
            }}
          >
            {previewSender ? (
              <><span style={{ fontWeight: 600 }}>{previewSender}:</span> {preview || "\u00A0"}</>
            ) : (previewText || "\u00A0")}
          </span>
          {(unreadCount ?? 0) > 0 && (
            <span
              className="shrink-0 font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center leading-none text-white"
              style={{
                fontSize: 11,
                background: "var(--sl-accent, #3E7368)",
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

// Section header — Studio Ledger: label + inline rule
function SectionHeader({
  label,
  icon,
  onAdd,
  collapsed,
  onToggle,
}: {
  label: string;
  icon?: React.ReactNode;
  onAdd?: () => void;
  collapsed?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className="flex items-center" style={{ padding: "18px 16px 10px", gap: 6 }}>
      {icon && <span style={{ color: "var(--sl-ink-faint, #726E66)", flexShrink: 0 }}>{icon}</span>}
      <button
        onClick={onToggle}
        className="flex items-center gap-1 text-left transition"
        style={{
          fontFamily: "var(--font-display, 'Space Grotesk', sans-serif)",
          fontSize: 12.5,
          fontWeight: 500,
          color: "var(--sl-ink-faint, #726E66)",
          flexShrink: 0,
        }}
      >
        {onToggle && (
          <span className="mr-0.5 opacity-60" style={{ fontSize: 9 }}>{collapsed ? "▶" : "▼"}</span>
        )}
        {label}
      </button>
      {/* Inline rule */}
      <div style={{ flex: 1, height: 1, background: "var(--sl-line-strong, rgba(0,0,0,0.10))", marginLeft: 4 }} />
      {onAdd && (
        <button
          onClick={onAdd}
          className="shrink-0 w-5 h-5 flex items-center justify-center rounded transition hover:opacity-80"
          style={{
            color: "var(--sl-accent, #3E7368)",
            fontSize: 16,
            marginLeft: 4,
          }}
        >+</button>
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
  const presence = useChatStore((s) => s.presence);

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
      style={{ background: "var(--color-sidebar-bg, var(--sl-bg, #F7F6F1))", color: "var(--sl-ink, #1A1814)" }}
    >
      {/* ── Topbar: logo left, admin right ── */}
      <div className="shrink-0 flex items-center justify-between px-4 pt-4 pb-3"
        style={{
          background: "var(--sidebar-header-bg, var(--sl-surface, #EFEDE7))",
        }}>
        {/* Brand logo */}
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg overflow-hidden shrink-0"
            style={{ background: "var(--sl-accent, #3E7368)" }}>
            <img src="/logo.png" alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          </div>
          <span style={{
            fontFamily: "var(--font-display, 'Space Grotesk', sans-serif)",
            fontWeight: 700, fontSize: 18,
            color: "var(--sl-ink, #1A1814)",
            letterSpacing: "-0.02em",
          }}>
            Ping<em style={{ fontStyle: "italic", color: "var(--sl-accent, #3E7368)" }}>!</em>
          </span>
        </div>
        {/* Admin icon — all screens */}
        {isAdminish && (
          <button
            onClick={() => setAdminOpen(!adminOpen)}
            title="Admin Dashboard"
            className="shrink-0 w-8 h-8 flex items-center justify-center rounded-lg transition"
            style={{
              background: adminOpen ? "var(--sl-accent-soft, #E6F0EE)" : "var(--color-sidebar-bg, var(--sl-bg, #F7F6F1))",
              color: "var(--sl-ink-soft, #3D3B36)",
              border: "1px solid var(--sl-line-strong, rgba(0,0,0,0.10))",
            }}
          >
            {/* Settings gear icon */}
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
          </button>
        )}
      </div>

      {/* ── Search bar ── */}
      <div className="shrink-0 px-3 pb-3 pt-2"
        style={{
          background: "var(--sidebar-header-bg, var(--sl-surface, #EFEDE7))",
          borderBottom: "1px solid var(--sidebar-header-border, var(--sl-line-strong, rgba(0,0,0,0.10)))"
        }}>
        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
          style={{
            background: "var(--sl-bg, #F7F6F1)",
            border: "1px solid var(--sl-line-strong, rgba(0,0,0,0.08))"
          }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
            style={{ color: "var(--sl-ink-fainter, #A09C93)", flexShrink: 0 }}>
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
          </svg>
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={showDMs ? "Cari DM…" : "Cari group…"}
            className="flex-1 bg-transparent text-sm placeholder:opacity-40 outline-none"
            style={{ color: "var(--sl-ink, #1A1814)", fontSize: 14 }}
          />
          {filter && (
            <button onClick={() => setFilter("")}
              className="transition text-xs opacity-40 hover:opacity-70"
              style={{ color: "var(--sl-ink, #1A1814)" }}>✕</button>
          )}
        </div>
      </div>

      {/* ── Scrollable nav list ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain" style={{ scrollbarWidth: "none" }}>

        {/* ─ Home / Topics view ─ */}
        {showTopics && railView !== "activity" && (
          <>
            {/* ── Most Active Groups (collapsed by default) ── */}
            {(() => {
              const allGroups = [
                ...(sidebar?.pinnedTop || []),
                ...(sidebar?.level1 || []).flatMap((l) => [l, ...(l.subTopics || [])]),
              ]
                .filter((g) => g.type !== "DM" && g.lastMessageAt)
                .sort((a, b) => new Date(b.lastMessageAt!).getTime() - new Date(a.lastMessageAt!).getTime())
                .slice(0, 5);
              if (allGroups.length === 0) return null;
              return (
                <>
                  <SectionHeader
                    label="Paling Aktif"
                    icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>}
                    collapsed={collapsed["active"] !== false}
                    onToggle={() => toggleCollapse("active")}
                  />
                  {collapsed["active"] === false && (
                    <div>
                      {allGroups.map((g) => (
                        <WaItem
                          key={`active-${g.id}`}
                          avatarIcon={g.icon || "#"}
                          label={g.name || "Group"}
                          preview={g.lastMessageText}
                          previewSender={g.lastMessageSender}
                          timestamp={formatLastTime(g.lastMessageAt)}
                          active={activeId === g.id}
                          unread={g.unread > 0}
                          unreadCount={g.unread}
                          onClick={() => onOpen(g.id)}
                        />
                      ))}
                    </div>
                  )}
                </>
              );
            })()}
            {/* Pinned section */}
            {(sidebar?.pinnedTop || []).filter(matchItem).length > 0 && (
              <>
                <SectionHeader label="Pinned"
                  icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 0-1-1h-1V4h-2v2h-1a1 1 0 0 0-1 1z"/></svg>}
                />
                <div>
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
                      pinned
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
                  icon={<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>}
                  collapsed={collapsed["channels"]}
                  onToggle={() => toggleCollapse("channels")}
                  onAdd={isAdminish ? () => setShowNewTopic(true) : undefined}
                />
                {!collapsed["channels"] && (
                  <div>
                    {(sidebar?.level1 || []).filter(matchItem).map((lv) => (
                      <div key={lv.id}>
                        {/* Orphan sub: show parent as non-clickable label above */}
                        {lv.isOrphanSub && (
                          <div
                            className="flex items-center gap-2 px-4 pt-2 pb-1 select-none"
                            style={{ opacity: 0.5, cursor: "default" }}
                          >
                            <span
                              className="inline-flex items-center justify-center shrink-0 text-xs font-bold"
                              style={{
                                width: 22, height: 22,
                                borderRadius: "var(--sl-radius-tile, 8px)",
                                background: "var(--sl-tile-folder-bg, #F3EEE0)",
                                color: "var(--sl-tile-folder-fg, #A67C2E)",
                              }}
                            >
                              {lv.parentIcon && (lv.parentIcon.startsWith("/") || lv.parentIcon.startsWith("http"))
                                ? <img src={apiUrl(lv.parentIcon)} alt="" style={{ width: 22, height: 22, borderRadius: "var(--sl-radius-tile, 8px)", objectFit: "cover" }} />
                                : (lv.parentIcon || "#")}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--sl-ink-faint, #8B8A7E)" }}>
                              {lv.parentName || "Group"}
                            </span>
                          </div>
                        )}
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
                                className="shrink-0 opacity-30 hover:opacity-60 w-3 text-left transition"
                                style={{ color: "var(--sl-ink-soft, #3D3B36)", fontSize: 9 }}
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
                <p className="text-sm" style={{ color: "var(--sl-ink-faint, #726E66)" }}>Belum ada group.</p>
                {isAdminish && (
                  <button
                    onClick={() => setShowNewTopic(true)}
                    className="mt-2 text-sm underline transition"
                    style={{ color: "var(--sl-accent, #3E7368)" }}
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
                        avatarUrl={dm.partnerAvatarUrl}
                        label={dm.name || "Direct Message"}
                        preview={dm.lastMessageText}
                        timestamp={formatLastTime(dm.lastMessageAt)}
                        active={activeId === dm.id}
                        unread={dm.unread > 0}
                        unreadCount={dm.unread}
                        online={dm.partnerId ? presence[dm.partnerId] === "online" : undefined}
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
                    avatarUrl={dm.partnerAvatarUrl}
                    label={dm.name || "Direct Message"}
                    preview={dm.lastMessageText}
                    timestamp={formatLastTime(dm.lastMessageAt)}
                    active={activeId === dm.id}
                    unread={dm.unread > 0}
                    unreadCount={dm.unread}
                    online={dm.partnerId ? presence[dm.partnerId] === "online" : undefined}
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
