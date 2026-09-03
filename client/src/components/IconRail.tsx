import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chat";
import { useUIStore, type RailView } from "../store/ui";
import { apiUrl } from "../lib/api";

const HomeIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const DMIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const ActivityIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

const SearchIcon = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <path d="m21 21-4.3-4.3"/>
  </svg>
);

function RailBtn({
  icon,
  label,
  active,
  badge,
  onClick,
  bottom,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
  bottom?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={bottom
        ? `bottom-nav-item${active ? " is-active" : ""}`
        : `icon-rail-item${active ? " is-active" : ""}`}
    >
      {icon}
      {bottom && <span className="bottom-nav-label">{label}</span>}
      {badge != null && badge > 0 && (
        <span className="badge-unread" style={{ position: "absolute", top: 2, right: bottom ? 8 : 2 }}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

export function IconRail({ variant = "side" }: { variant?: "side" | "bottom" }) {
  const user = useAuthStore((s) => s.user);
  const sidebar = useChatStore((s) => s.sidebar);
  const railView = useUIStore((s) => s.railView);
  const setRailView = useUIStore((s) => s.setRailView);
  const setSearchActive = useChatStore((s) => s.setSearchActive);
  const setProfileOpen = useUIStore((s) => s.setProfileOpen);
  const profileOpen = useUIStore((s) => s.profileOpen);
  const setChatOpen = useUIStore((s) => s.setChatOpen);

  // Count total unread DMs
  const dmUnread = (sidebar?.dms || []).reduce((sum, d) => sum + (d.unread || 0), 0);

  const navigate = (view: RailView) => {
    setRailView(view);
    setProfileOpen(false);
    if (view === "search") {
      setSearchActive(true);
    } else {
      setSearchActive(false);
    }
  };

  const avatarBtn = (
    <button
      onClick={() => {
        setProfileOpen(!profileOpen);
        if (!profileOpen) setChatOpen(false);
      }}
      title={user?.name || "Profil"}
      aria-label="Profil"
      className={`${variant === "bottom" ? "bottom-nav-avatar" : "icon-rail-avatar"}${profileOpen ? " is-active" : ""}`}
      style={{
        border: "2px solid transparent",
        overflow: "hidden",
        borderRadius: "9999px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {user?.avatarUrl ? (
        <img
          src={apiUrl(user.avatarUrl)}
          alt={user.name}
          style={{ width: variant === "bottom" ? 34 : 24, height: variant === "bottom" ? 34 : 24, objectFit: "cover", borderRadius: "9999px" }}
        />
      ) : (
        <span style={{
          width: variant === "bottom" ? 36 : 27,
          height: variant === "bottom" ? 36 : 27,
          background: "var(--color-rail-bg-active)",
          color: "var(--color-rail-icon-active, #fff)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
          fontSize: 11,
          borderRadius: "50%",
        }}>
          {user?.name?.charAt(0).toUpperCase()}
        </span>
      )}
    </button>
  );

  if (variant === "bottom") {
    return (
      <nav className="bottom-nav" style={{
        background: "var(--color-rail-bg, var(--sl-bg, #F7F6F1))",
        borderTop: "1px solid var(--sl-line-strong, rgba(0,0,0,0.10))",
      }}>
        <RailBtn icon={<HomeIcon size={24} />} label="Home" active={railView === "home" && !profileOpen} onClick={() => navigate("home")} bottom />
        <RailBtn icon={<DMIcon size={24} />} label="DM" active={railView === "dms" && !profileOpen} badge={dmUnread} onClick={() => navigate("dms")} bottom />
        <RailBtn icon={<ActivityIcon size={24} />} label="Activity" active={railView === "activity" && !profileOpen} onClick={() => navigate("activity")} bottom />
        <RailBtn icon={<SearchIcon size={24} />} label="Search" active={railView === "search" && !profileOpen} onClick={() => navigate("search")} bottom />
        {avatarBtn}
      </nav>
    );
  }

  return (
    <aside className="icon-rail" style={{ background: "var(--color-rail-bg, var(--sl-surface, #EDECE5))", borderRight: "1px solid var(--sl-line-strong, #DEDCD2)" }}>

      {/* Nav items */}
      <RailBtn icon={<HomeIcon />} label="Home" active={railView === "home" && !profileOpen} onClick={() => navigate("home")} />
      <RailBtn icon={<DMIcon />} label="Direct Messages" active={railView === "dms" && !profileOpen} badge={dmUnread} onClick={() => navigate("dms")} />
      <RailBtn icon={<ActivityIcon />} label="Activity" active={railView === "activity" && !profileOpen} onClick={() => navigate("activity")} />
      <RailBtn icon={<SearchIcon />} label="Search" active={railView === "search" && !profileOpen} onClick={() => navigate("search")} />

      {/* Spacer */}
      <div className="icon-rail-spacer" />

      {/* Profile avatar */}
      {avatarBtn}
    </aside>
  );
}
