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
  const chatOpen = useUIStore((s) => s.chatOpen);
  const setChatOpen = useUIStore((s) => s.setChatOpen);
  const adminOpen = useUIStore((s) => s.adminOpen);
  const setAdminOpen = useUIStore((s) => s.setAdminOpen);
  const profileOpen = useUIStore((s) => s.profileOpen);
  const setProfileOpen = useUIStore((s) => s.setProfileOpen);
  const forwardTarget = useUIStore((s) => s.forwardTarget);
  const railView = useUIStore((s) => s.railView);

  // Mobile: push history entry when chat opens so back button closes it
  useEffect(() => {
    if (isDesktop) return;
    const showChat = chatOpen && !!activeId;
    if (showChat) {
      window.history.pushState({ chat: true }, "");
    }
  }, [chatOpen, activeId, isDesktop]);

  // Mobile: push history entry when admin opens so back button closes it
  useEffect(() => {
    if (isDesktop) return;
    if (adminOpen) {
      window.history.pushState({ admin: true }, "");
    }
  }, [adminOpen, isDesktop]);

  useEffect(() => {
    if (isDesktop) return;
    const handler = (e: PopStateEvent) => {
      if (adminOpen) {
        setAdminOpen(false);
        e.preventDefault();
      } else if (chatOpen) {
        setChatOpen(false);
        e.preventDefault();
      }
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [chatOpen, adminOpen, setChatOpen, setAdminOpen, isDesktop]);

  if (!isDesktop) {
    const showChat = chatOpen && !!activeId && !adminOpen;
    const showBottomNav = !showChat && !adminOpen;
    return (
      <div className="h-full flex flex-col bg-appbg relative overflow-x-hidden">
        {/* Main content — fills space above bottom nav */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {adminOpen ? (
            <AdminPanel />
          ) : showChat ? (
            <div className="h-full flex flex-col" data-area="chat"><ChatView /></div>
          ) : profileOpen ? (
            <ProfileView onClose={() => setProfileOpen(false)} />
          ) : railView === "search" || searchActive ? (
            <SearchView />
          ) : (
            <div className="h-full flex flex-col" data-area="sidebar" style={{ fontSize: "var(--sidebar-font-size, 15px)" }}><Sidebar /></div>
          )}
        </div>

        {/* Bottom nav — shown on all mobile screens except chat/admin */}
        {showBottomNav && <IconRail variant="bottom" />}

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
        data-area="sidebar"
        style={{ width: "var(--sidebar-width, 240px)", background: "var(--color-sidebar-bg, #1A2540)", fontSize: "var(--sidebar-font-size, 15px)" }}>
        <Sidebar />
      </div>

      {/* Main content area */}
      <div className="flex-1 min-w-0 flex flex-col" data-area="chat">
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
      <div className="w-16 h-16 rounded-2xl overflow-hidden mb-4" style={{ boxShadow: "var(--shadow-md)" }}>
        <img src="/logo.png" alt="Ping!" className="w-full h-full object-cover" />
      </div>
      <p className="text-lg font-semibold" style={{ color: "var(--text-primary)" }}>Selamat datang di Ping!</p>
      <p className="text-sm mt-1">Pilih channel atau DM untuk mulai</p>
    </div>
  );
}