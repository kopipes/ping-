import { useEffect, useState } from "react";
import { useChatStore } from "../store/chat";
import { useUIStore } from "../store/ui";
import { Sidebar } from "./Sidebar";
import { ChatView } from "./ChatView";
import { SearchView } from "./SearchView";
import { ProfileView } from "./ProfileView";
import { ForwardModal } from "./ForwardModal";
import { AdminPanel } from "./AdminPanel";
import { IconRail } from "./IconRail";
import { useAuthStore } from "../store/auth";
import { apiUrl } from "../lib/api";

function useIsDesktop() {
  const [desktop, setDesktop] = useState(
    typeof window !== "undefined" ? window.matchMedia("(min-width: 768px)").matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const cb = (e: MediaQueryListEvent) => setDesktop(e.matches);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  }, []);
  return desktop;
}

export function Layout() {
  const isDesktop = useIsDesktop();
  const activeId = useChatStore((s) => s.activeId);
  const searchActive = useChatStore((s) => s.searchActive);
  const mobileTab = useUIStore((s) => s.mobileTab);
  const chatOpen = useUIStore((s) => s.chatOpen);
  const adminOpen = useUIStore((s) => s.adminOpen);
  const profileOpen = useUIStore((s) => s.profileOpen);
  const setProfileOpen = useUIStore((s) => s.setProfileOpen);
  const forwardTarget = useUIStore((s) => s.forwardTarget);
  const railView = useUIStore((s) => s.railView);

  if (!isDesktop) {
    const showChat = chatOpen && !!activeId && !adminOpen;
    return (
      <div className="h-full flex flex-col bg-appbg relative overflow-x-hidden">
        <div className="flex-1 min-h-0 overflow-hidden">
          {adminOpen ? (
            <AdminPanel />
          ) : showChat ? (
            <ChatView />
          ) : mobileTab === "search" ? (
            <SearchView />
          ) : mobileTab === "profile" ? (
            <ProfileView />
          ) : (
            <Sidebar />
          )}
        </div>
        {!showChat && !adminOpen && <BottomNav />}
        {forwardTarget && <ForwardModal />}
      </div>
    );
  }

  // Desktop: Icon Rail (72px) + Sidebar (240px) + Main content
  return (
    <div className="h-full flex bg-appbg" style={{ fontFamily: "var(--font-sans)" }}>
      {/* Icon Rail — always visible on desktop */}
      <IconRail />

      {/* Sidebar — topics or DMs depending on rail selection */}
      <div className="flex flex-col min-h-0 shrink-0 border-r border-border"
        style={{ width: "var(--sidebar-width, 240px)", background: "var(--color-sidebar-bg, #1A2540)" }}>
        <Sidebar />
      </div>

      {/* Main content area */}
      <div className="flex-1 min-w-0 flex flex-col">
        {adminOpen ? (
          <AdminPanel />
        ) : profileOpen ? (
          <ProfileView onClose={() => setProfileOpen(false)} />
        ) : railView === "search" || searchActive ? (
          <SearchView />
        ) : activeId ? (
          <ChatView />
        ) : (
          <EmptyState />
        )}
      </div>
      {forwardTarget && <ForwardModal />}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center" style={{ color: "var(--text-tertiary)" }}>
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-black text-white mb-4"
        style={{ background: "var(--color-rail-active-pill)", boxShadow: "var(--shadow-md)" }}>Pi</div>
      <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Selamat datang di Ping!</p>
      <p className="text-sm mt-1">Pilih channel atau DM untuk mulai</p>
    </div>
  );
}

function BottomNav() {
  const mobileTab = useUIStore((s) => s.mobileTab);
  const setMobileTab = useUIStore((s) => s.setMobileTab);
  const setRailView = useUIStore((s) => s.setRailView);
  const setSearchActive = useChatStore((s) => s.setSearchActive);
  const setChatOpen = useUIStore((s) => s.setChatOpen);
  const sidebar = useChatStore((s) => s.sidebar);
  const user = useAuthStore((s) => s.user);

  const dmUnread = (sidebar?.dms || []).reduce((sum, d) => sum + (d.unread || 0), 0);
  const isActive = (tab: string) => mobileTab === tab;

  const navItems = [
    {
      key: "list", label: "Home",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      ),
    },
    {
      key: "dms", label: "DM",
      badge: dmUnread,
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      ),
    },
    {
      key: "search", label: "Cari",
      icon: (active: boolean) => (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 2} strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <path d="m21 21-4.3-4.3"/>
        </svg>
      ),
    },
    {
      key: "profile", label: "Profil",
      icon: (active: boolean) => user?.avatarUrl ? (
        <img src={apiUrl(user.avatarUrl)} alt={user.name}
          className="w-6 h-6 rounded-full object-cover"
          style={{ border: active ? "2px solid var(--color-brand-600)" : "2px solid transparent" }} />
      ) : (
        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
          style={{ background: active ? "var(--color-brand-600)" : "var(--text-tertiary)" }}>
          {user?.name?.charAt(0).toUpperCase()}
        </span>
      ),
    },
  ];

  return (
    <nav className="shrink-0 flex items-stretch"
      style={{
        height: "var(--touch-target-min, 56px)",
        borderTop: "1px solid var(--border-default)",
        background: "var(--surface-card)",
      }}>
      {navItems.map(({ key, label, icon, badge }) => {
        const active = isActive(key);
        return (
          <button key={key}
            onClick={() => {
              if (key === "dms") {
                setMobileTab("list");
                setRailView("dms");
                setSearchActive(false);
                setChatOpen(false);
              } else if (key === "search") {
                setMobileTab("search");
                setSearchActive(true);
                setChatOpen(false);
              } else {
                setMobileTab(key as any);
                setSearchActive(false);
                setChatOpen(false);
              }
            }}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 relative transition-all active:scale-95"
            style={{ minHeight: "var(--touch-target-min, 44px)" }}
          >
            <span className={`w-10 h-7 flex items-center justify-center rounded-full transition-all`}
              style={{ background: active ? "var(--color-brand-50)" : "transparent",
                       color: active ? "var(--color-brand-600)" : "var(--text-tertiary)" }}>
              {icon(active)}
            </span>
            <span className="text-[10px] font-medium"
              style={{ color: active ? "var(--color-brand-600)" : "var(--text-tertiary)" }}>
              {label}
            </span>
            {badge != null && badge > 0 && (
              <span className="badge-unread" style={{ position: "absolute", top: 4, right: "calc(50% - 18px)" }}>
                {badge > 99 ? "99+" : badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}