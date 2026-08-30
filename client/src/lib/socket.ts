import { io, type Socket } from "socket.io-client";
import { apiBase, getAccessToken } from "./api";
import type { Message } from "../types";

type Listener = (payload: any) => void;

const listeners = new Map<string, Set<Listener>>();
let socket: Socket | null = null;
let isConnected = false;

export function on(event: string, fn: Listener) {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  return () => {
    listeners.get(event)?.delete(fn);
  };
}

function emitLocal(event: string, payload: any) {
  listeners.get(event)?.forEach((fn) => fn(payload));
}

export function connectSocket() {
  const token = getAccessToken();
  if (!token) return;
  // Already connected — skip
  if (socket?.connected) return;
  // Disconnect stale socket before reconnecting
  if (socket) {
    socket.disconnect();
    socket = null;
    isConnected = false;
  }

  socket = io(apiBase, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 10000,
  });

  socket.on("connect", () => {
    isConnected = true;
    console.log("[socket] connected");
    // notify auth store that we're online
    emitLocal("socket:connected", {});
  });

  socket.on("disconnect", (reason) => {
    isConnected = false;
    console.log("[socket] disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    console.warn("[socket] connect_error:", err.message);
  });

  const wire = (event: string, localEvent?: string) => {
    socket!.on(event, (payload: any) => {
      emitLocal(localEvent ?? event, payload);
    });
  };

  wire("message:new");
  wire("message:edited");
  wire("message:removed");
  wire("message:error");
  wire("reaction:added");
  wire("reaction:removed");
  wire("read:updated");
  wire("presence:update");
  wire("typing:start");
  wire("typing:stop");
  wire("pinned:added");
  wire("pinned:removed");
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
  isConnected = false;
}

export function getSocket() {
  return socket;
}

export function isSocketConnected() {
  return isConnected && socket?.connected === true;
}

// socket.io buffers emits if not yet connected — so emit regardless, it will send when connected
export function socketSend(event: string, payload: unknown) {
  if (!socket) {
    // Socket not created yet — reconnect then emit
    connectSocket();
  }
  socket?.emit(event, payload);
}

export type { Listener, Message };

export function markRead(conversationId: string) {
  socketSend("read:mark", { conversationId });
}
export function emitTyping(conversationId: string, start: boolean) {
  socketSend(start ? "typing:start" : "typing:stop", { conversationId });
}
export function emitReaction(action: "add" | "remove", messageId: string, emoji: string) {
  socketSend(action === "add" ? "reaction:add" : "reaction:remove", { messageId, emoji });
}
export function joinConversation(conversationId: string) {
  socketSend("join", conversationId);
}