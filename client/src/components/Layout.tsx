import { useEffect, useState } from "react";
import { useChatStore } from "../store/chat";
import { useUIStore } from "../store/ui";
import { Sidebar } from "./Sidebar";
import { ChatView } from "./ChatView";
import { SearchView } from "./SearchView";
import { ProfileView } from "./ProfileView";
import { ForwardModal } from "./ForwardModal";
import { AdminPanel } from "./AdminPanel";
import { useTranslation } from "react-i18next";
import { ChatIcon, SearchIcon, UserIcon } from "./icons";

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

  // Desktop: Slack 2-column layout (dark sidebar + white main)
  return (
    <div className="h-full flex bg-appbg">
      <div className="w-[260px] xl:w-[280px] flex flex-col min-h-0 shrink-0">
        <Sidebar />
      </div>
      <div className="flex-1 min-w-0 flex flex-col border-l border-border">
        {adminOpen ? (
          <AdminPanel />
        ) : profileOpen ? (
          <ProfileView onClose={() => setProfileOpen(false)} />
        ) : searchActive ? (
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
    <div className="h-full flex flex-col items-center justify-center text-textm">
      <div className="w-16 h-16 rounded-2xl bg-sb flex items-center justify-center text-2xl font-black text-white mb-4 shadow-md">Pi</div>
      <p className="text-lg font-semibold text-textp">Selamat datang di Ping!</p>
      <p className="text-sm mt-1">Pilih channel atau DM untuk mulai</p>
    </div>
  );
}

function BottomNav() {
  const { t } = useTranslation();
  const mobileTab = useUIStore((s) => s.mobileTab);
  const setMobileTab = useUIStore((s) => s.setMobileTab);
  const setSearchActive = useChatStore((s) => s.setSearchActive);
  const setChatOpen = useUIStore((s) => s.setChatOpen);

  const tabs = [
    { key: "list" as const, label: t("nav.chats"), Icon: ChatIcon },
    { key: "search" as const, label: t("nav.search"), Icon: SearchIcon },
    { key: "profile" as const, label: t("nav.profile"), Icon: UserIcon },
  ];

  return (
    <nav className="shrink-0 h-16 border-t border-border bg-white flex items-stretch">
      {tabs.map(({ key, label, Icon }) => {
        const active = mobileTab === key;
        return (
          <button key={key}
            onClick={() => { setMobileTab(key); setSearchActive(key === "search"); setChatOpen(false); }}
            className="flex-1 flex flex-col items-center justify-center gap-1 transition"
          >
            <span className={`w-10 h-7 flex items-center justify-center rounded-full transition-all ${active ? "bg-sb/10" : ""}`}>
              <Icon className={`w-5 h-5 ${active ? "text-sb" : "text-textm"}`} />
            </span>
            <span className={`text-[11px] font-medium ${active ? "text-sb" : "text-textm"}`}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}