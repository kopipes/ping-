import { create } from "zustand";
import type { Message } from "../types";

interface ForwardTarget {
  message: Message;
  sourceConversationId: string;
  sourceName: string | null;
}

type MobileTab = "list" | "search" | "profile";

interface UIStore {
  mobileTab: MobileTab;
  setMobileTab: (tab: MobileTab) => void;
  forwardTarget: ForwardTarget | null;
  openForward: (target: ForwardTarget) => void;
  closeForward: () => void;
  chatOpen: boolean;
  setChatOpen: (open: boolean) => void;
  adminOpen: boolean;
  setAdminOpen: (open: boolean) => void;
  profileOpen: boolean;
  setProfileOpen: (open: boolean) => void;
  pinnedTabOpen: boolean;
  setPinnedTabOpen: (open: boolean) => void;
  libraryTabOpen: boolean;
  setLibraryTabOpen: (open: boolean) => void;
}

export const useUIStore = create<UIStore>((set) => ({
  mobileTab: "list",
  setMobileTab: (mobileTab) => set({ mobileTab }),
  forwardTarget: null,
  openForward: (target) => set({ forwardTarget: target }),
  closeForward: () => set({ forwardTarget: null }),
  chatOpen: false,
  setChatOpen: (chatOpen) => set({ chatOpen }),
  adminOpen: false,
  setAdminOpen: (adminOpen) => set({ adminOpen }),
  profileOpen: false,
  setProfileOpen: (profileOpen) => set({ profileOpen }),
  pinnedTabOpen: false,
  setPinnedTabOpen: (pinnedTabOpen) => set({ pinnedTabOpen }),
  libraryTabOpen: false,
  setLibraryTabOpen: (libraryTabOpen) => set({ libraryTabOpen }),
}));