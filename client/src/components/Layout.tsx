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
  const adminOpen = useUIStore((s) => s.adminOpen);
  const profileOpen = useUIStore((s) => s.profileOpen);
  const setProfileOpen = useUIStore((s) => s.setProfileOpen);
  const forwardTarget = useUIStore((s) => s.forwardTarget);
  const railView = useUIStore((s) => s.railView);

  if (!isDesktop) {
    const showChat = chatOpen && !!activeId && !adminOpen;
    return (
      <div className="h-full flex bg-appbg relative overflow-x-hidden">
        {/* Same icon rail as desktop — left side on mobile too */}
        {!showChat && !adminOpen && <IconRail />}

        <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">
          {adminOpen ? (
            <AdminPanel />
          ) : showChat ? (
            <ChatView />
          ) : profileOpen ? (
            <ProfileView onClose={() => setProfileOpen(false)} />
          ) : railView === "search" || searchActive ? (
            <SearchView />
          ) : (
            <Sidebar />
          )}
        </div>
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