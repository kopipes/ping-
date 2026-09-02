export type Role = "SUPER_ADMIN" | "ADMIN" | "MANAGER" | "STAFF";

export interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  division?: string | null;
  role: Role;
  locale?: string;
  status?: string;
  lastSeenAt?: string | null;
}

export interface SidebarItem {
  id: string;
  type: "TOPIC" | "DM";
  name: string | null;
  icon: string | null;
  isPinnedTop: boolean;
  isReadOnly: boolean;
  parentId: string | null;
  unread: number;
  subTopics?: SidebarItem[];
  isOrphanSub?: boolean;
  parentName?: string | null;
  parentIcon?: string | null;
  partnerId?: string | null;
  lastMessageAt?: string | null;
  lastMessageText?: string | null;
  lastMessageSender?: string | null;
}

export interface SidebarData {
  pinnedTop: SidebarItem[];
  level1: SidebarItem[];
  dms: SidebarItem[];
}

export interface Attachment {
  id: string;
  messageId: string;
  type: "IMAGE" | "FILE" | "LINK";
  fileUrl: string;
  thumbnailUrl: string | null;
  fileName: string | null;
  fileSize: number | null;
  linkMetadata?: string | null;
}

export interface Reaction {
  emoji: string;
  userId: string;
}

export interface Message {
  id: string;
  conversationId: string;
  parentId: string | null;
  content: string | null;
  isEdited: boolean;
  isDeleted: boolean;
  createdAt: string;
  userId: string;
  user: { id: string; name: string; avatarUrl: string | null };
  attachments: Attachment[];
  reactions: Reaction[];
  replyCount: number;
  status?: "sending" | "sent" | "failed";
  isForwarded?: boolean;
  forwardedFromName?: string | null;
  forwardedFromConversationId?: string | null;
}

export interface Conversation {
  id: string;
  type: "TOPIC" | "DM";
  name: string | null;
  description: string | null;
  icon: string | null;
  parentId: string | null;
  parent?: { id: string; name: string } | null;
  ownerId?: string | null;
  owner?: { id: string; name: string } | null;
  allowStaffPin: boolean;
  isArchived: boolean;
  isPinnedTop: boolean;
  isReadOnly: boolean;
  isPublic: boolean;
  members?: ConversationMember[];
  subTopics?: { id: string; name: string; icon: string | null; isReadOnly: boolean }[];
}

export interface ConversationMember {
  id: string;
  role: string;
  user: { id: string; name: string; avatarUrl: string | null; status: string; lastSeenAt: string | null; role: string };
}

export interface PinnedItem {
  id: string;
  conversationId: string;
  messageId: string;
  note: string | null;
  pinnedAt: string;
  message: Message;
  pinnedBy: { id: string; name: string };
}

export interface LibraryItem extends Attachment {
  message: { id: string; conversationId: string; createdAt: string; userId: string };
}

export interface SearchResult {
  id: string;
  conversationId: string;
  conversationName: string | null;
  conversationType: string;
  content: string | null;
  createdAt: string;
  user: { id: string; name: string; avatarUrl: string | null };
  attachments: Attachment[];
  matchType: "message" | "file" | "link";
}

export interface SearchResponse {
  topics: { id: string; name: string | null; icon: string | null; type: string; isPinnedTop: boolean; parentId: string | null }[];
  messages: SearchResult[];
  files: SearchResult[];
  links: SearchResult[];
}

export interface Permissions {
  isSuperAdmin: boolean;
  isAdmin: boolean;
  isManagerOrAbove: boolean;
  isOwner: boolean;
  canPost: boolean;
  canCreateLevel1: boolean;
  canManageMembers: boolean;
  canStaffPin: boolean;
  isSystemTopic: boolean;
  canDeleteDM?: boolean;
}