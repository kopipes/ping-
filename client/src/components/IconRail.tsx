import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chat";
import { useUIStore, type RailView } from "../store/ui";
import { apiUrl } from "../lib/api";

const HomeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
    <polyline points="9 22 9 12 15 12 15 22"/>
  </svg>
);

const DMIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

const ActivityIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

const SearchIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`icon-rail-item${active ? " is-active" : ""}`}
    >
      {icon}
      {badge != null && badge > 0 && (
        <span className="badge-unread" style={{ position: "absolute", top: 2, right: 2 }}>
          {badge > 99 ? "99+" : badge}
        </span>
      )}
    </button>
  );
}

export function IconRail() {
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

  return (
    <aside className="icon-rail" style={{ background: "var(--color-rail-bg)" }}>
      {/* Logo mark */}
      <div className="icon-rail-logo" style={{ background: "var(--color-rail-active-pill)", overflow: "hidden", padding: 0 }}>
        <img src="/logo.png" alt="Ping!" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>

      {/* Nav items */}
      <RailBtn
        icon={<HomeIcon />}
        label="Home"
        active={railView === "home" && !profileOpen}
        onClick={() => navigate("home")}
      />
      <RailBtn
        icon={<DMIcon />}
        label="Direct Messages"
        active={railView === "dms" && !profileOpen}
        badge={dmUnread}
        onClick={() => navigate("dms")}
      />
      <RailBtn
        icon={<ActivityIcon />}
        label="Activity"
        active={railView === "activity" && !profileOpen}
        onClick={() => navigate("activity")}
      />
      <RailBtn
        icon={<SearchIcon />}
        label="Search"
        active={railView === "search" && !profileOpen}
        onClick={() => navigate("search")}
      />

      {/* Spacer */}
      <div className="icon-rail-spacer" />

      {/* Profile avatar */}
      <button
        onClick={() => {
          setProfileOpen(!profileOpen);
          if (!profileOpen) setChatOpen(false);
        }}
        title={user?.name || "Profil"}
        aria-label="Profil"
        className="icon-rail-avatar"
        style={{
          border: profileOpen ? "2px solid rgba(255,255,255,0.6)" : "2px solid transparent",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {user?.avatarUrl ? (
          <img
            src={apiUrl(user.avatarUrl)}
            alt={user.name}
            style={{ width: 24, height: 24, objectFit: "cover" }}
          />
        ) : (
          <span style={{
            width: 27, height: 27,
            background: "var(--color-rail-bg-active)",
            color: "#fff",
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
    </aside>
  );
}
