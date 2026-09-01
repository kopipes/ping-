import { useEffect, useRef, useState } from "react";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chat";
import { api, apiUrl } from "../lib/api";
import { useModal } from "./Modal";
import type { Conversation } from "../types";

const EMOJIS = ["📁","🚀","🎯","🧠","📊","🛠️","🖥️","🎨","📈","📚","🏢","💡","📋","🔧","🌐","💬","🔔","⚡","🌟","🎓"];

interface Props {
  conversationId: string;
  onClose: () => void;
}

export function ConversationInfoPanel({ conversationId, onClose }: Props) {
  const myId = useAuthStore((s) => s.user?.id);
  const myRole = useAuthStore((s) => s.user?.role);
  const convo = useChatStore((s) => s.conversation[conversationId]);
  const perms = useChatStore((s) => s.permissions[conversationId]);
  const loadSidebar = useChatStore((s) => s.loadSidebar);
  const openConversation = useChatStore((s) => s.openConversation);
  const { toast, confirm } = useModal();

  // Always re-fetch permissions when panel opens so canDeleteDM is fresh
  useEffect(() => {
    api<any>(`/api/conversations/${conversationId}/permissions`)
      .then((p) => useChatStore.setState((s) => ({ permissions: { ...s.permissions, [conversationId]: p } })))
      .catch(() => {});
  }, [conversationId]);

  // Edit state
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editIcon, setEditIcon] = useState("");
  const [saving, setSaving] = useState(false);
  const [iconUploading, setIconUploading] = useState(false);
  const iconInputRef = useRef<HTMLInputElement>(null);
  // Local isPublic state — initialized from convo, updates instantly on toggle
  const [isPublic, setIsPublic] = useState<boolean>(false);

  // Members state
  const [members, setMembers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string; division: string | null }[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [addingIds, setAddingIds] = useState<string[]>([]);

  const isDM = convo?.type === "DM";
  // Owner can always edit. App admins can edit any group including system channels.
  const canEdit = perms?.isOwner || myRole === "ADMIN" || myRole === "SUPER_ADMIN" || false;
  // #8: group admin (MANAGER role in conversation) OR app admin can manage members
  const myMemberRole = members.find((m) => m.user.id === myId)?.role;
  const isGroupAdmin = myMemberRole === "MANAGER" || myMemberRole === "ADMIN";
  const canManageMembers = perms?.canManageMembers || isGroupAdmin || false;
  const isAdminish = myRole === "ADMIN" || myRole === "SUPER_ADMIN";

  useEffect(() => {
    if (convo) {
      setEditName(convo.name || "");
      setEditDesc(convo.description || "");
      setEditIcon(convo.icon || "📁");
      setIsPublic(!!convo.isPublic);
    }
  }, [convo]);

  // Load members
  useEffect(() => {
    setMembersLoading(true);
    Promise.all([
      api<any>(`/api/conversations/${conversationId}`),
      canManageMembers ? api<any[]>("/api/users") : Promise.resolve([]),
    ]).then(([c, users]) => {
      setMembers(c.members || []);
      setAllUsers((users as any[]).filter((u) => u.id !== myId));
      setMembersLoading(false);
    }).catch(() => setMembersLoading(false));
  }, [conversationId]);

  const saveEdit = async () => {
    if (!editName.trim()) { toast("Nama tidak boleh kosong"); return; }
    setSaving(true);
    try {
      await api(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        body: { name: editName.trim(), description: editDesc.trim() || undefined, icon: editIcon },
      });
      // Reload conversation data
      await openConversation(conversationId);
      await loadSidebar();
      setEditMode(false);
                    toast("Group berhasil diperbarui");
    } catch (e: any) { toast(e?.message || "Gagal simpan"); }
    finally { setSaving(false); }
  };

  const uploadIcon = async (file: File) => {
    setIconUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await api<{ fileUrl: string; thumbnailUrl: string | null }>("/api/upload", { method: "POST", formData: form });
      setEditIcon(res.thumbnailUrl || res.fileUrl);
    } catch (e: any) { toast("Upload gagal: " + (e?.message || "")); }
    finally { setIconUploading(false); }
  };

  const removeMember = async (userId: string, name: string) => {
    const ok = await confirm({ title: "Hapus Member", message: `Hapus ${name} dari group ini?`, confirmLabel: "Hapus", danger: true });
    if (!ok) return;
    try {
      await api(`/api/conversations/${conversationId}/members/${userId}`, { method: "DELETE" });
      setMembers((m) => m.filter((x) => x.user.id !== userId));
    } catch (e: any) { toast(e?.message || "Gagal hapus member"); }
  };

  const addMember = async (userId: string) => {
    setAddingIds((ids) => [...ids, userId]);
    try {
      await api(`/api/conversations/${conversationId}/members`, { method: "POST", body: { userId } });
      // Reload members
      const c = await api<any>(`/api/conversations/${conversationId}`);
      setMembers(c.members || []);
    } catch (e: any) { toast(e?.message || "Gagal tambah member"); }
    finally { setAddingIds((ids) => ids.filter((id) => id !== userId)); }
  };

  const updateMemberRole = async (userId: string, newRole: string) => {
    try {
      await api(`/api/conversations/${conversationId}/members/${userId}/role`, {
        method: "PATCH",
        body: { role: newRole },
      });
      setMembers((m) => m.map((x) => x.user.id === userId ? { ...x, role: newRole } : x));
      toast(newRole === "MANAGER" ? "Dijadikan Admin Group" : "Dikembalikan jadi Anggota");
    } catch (e: any) { toast(e?.message || "Gagal ubah role"); }
  };

  const deleteConversation = async () => {
    const ok = await confirm({
      title: "Hapus Group",
      message: `Hapus group "${convo?.name}" secara permanen? Semua pesan dan data akan hilang.`,
      confirmLabel: "Hapus",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/conversations/${conversationId}`, { method: "DELETE" });
      await loadSidebar();
      onClose();
    } catch (e: any) { toast(e?.message || "Gagal hapus"); }
  };

  const togglePinnedTop = async () => {
    const isPinned = !!(convo as any)?.isPinnedTop;
    try {
      await api(`/api/admin/conversations/${conversationId}/pinned-top`, {
        method: "PATCH",
        body: { isPinnedTop: !isPinned },
      });
      await loadSidebar();
      await openConversation(conversationId);
      toast(isPinned ? "Dihapus dari Pinned" : "Ditambahkan ke Pinned");
    } catch (e: any) { toast(e?.message || "Gagal update Pinned"); }
  };

  const deleteDM = async () => {
    const ok = await confirm({
      title: "Hapus Percakapan",
      message: "Pengguna ini sudah tidak ada. Hapus percakapan beserta semua pesannya secara permanen?",
      confirmLabel: "Hapus",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/conversations/${conversationId}/dm`, { method: "DELETE" });
      await loadSidebar();
      onClose();
    } catch (e: any) { toast(e?.message || "Gagal hapus DM"); }
  };

  const togglePublic = async () => {
    const newValue = !isPublic;
    // Update local state immediately so button changes right away
    setIsPublic(newValue);
    try {
      await api(`/api/conversations/${conversationId}`, {
        method: "PATCH",
        body: { isPublic: newValue },
      });
      // Clear conversation cache so convo reloads fresh
      useChatStore.setState((s) => ({
        conversation: { ...s.conversation, [conversationId]: undefined as any },
      }));
      await loadSidebar();
      await openConversation(conversationId);
      toast(newValue ? "Group sekarang Public — semua user bisa melihat" : "Group sekarang Member Only");
    } catch (e: any) {
      // Revert local state on error
      setIsPublic(!newValue);
      toast(e?.message || "Gagal update visibilitas");
    }
  };

  const nonMembers = allUsers.filter(
    (u) => !members.some((m) => m.user.id === u.id) &&
    (!userSearch || u.name.toLowerCase().includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase()))
  );
  const filteredMembers = members.filter(
    (m) => !userSearch || m.user.name.toLowerCase().includes(userSearch.toLowerCase())
  );

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* Panel — slides in from right */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-sm bg-white shadow-2xl flex flex-col fade-slide-up"
        style={{ borderLeft: "1px solid var(--border-default)" }}>

        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-b border-gray-200">
          {!isDM && (
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl"
              style={{ background: "var(--color-brand-50, #EEF1FF)" }}>
              {convo?.icon || "#"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-gray-900 text-base truncate">
              {isDM ? "Info DM" : (() => {
                const n = convo?.name || "Group";
                const icon = convo?.icon;
                // Strip leading emoji+space if it matches the icon (system channels like "📢 Announcement")
                if (icon && n.startsWith(icon)) return n.slice(icon.length).trimStart();
                return n;
              })()}
            </h2>
            {!isDM && convo?.parent && (
              <p className="text-xs text-gray-500">dalam {convo.parent.name}</p>
            )}
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 shrink-0">
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Info / Edit section (topics only) ── */}
          {!isDM && (
            <section className="px-5 py-4 border-b border-gray-100">
              {editMode ? (
                <div className="space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ikon</label>
                    {/* Image upload + preview */}
                    <div className="flex items-center gap-3 mt-2 mb-2">
                      <div className="w-14 h-14 rounded-xl border-2 border-gray-200 flex items-center justify-center text-2xl overflow-hidden shrink-0"
                        style={{ background: "#F8F9FC" }}>
                        {editIcon && (editIcon.startsWith("/") || editIcon.startsWith("http")) ? (
                          <img src={apiUrl(editIcon)} alt="icon" className="w-full h-full object-cover" />
                        ) : (
                          <span>{editIcon || "📁"}</span>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <button
                          onClick={() => iconInputRef.current?.click()}
                          disabled={iconUploading}
                          className="h-8 px-3 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                        >
                          {iconUploading ? "Mengupload…" : "Upload Gambar"}
                        </button>
                        {(editIcon.startsWith("/") || editIcon.startsWith("http")) && (
                          <button onClick={() => setEditIcon("📁")}
                            className="text-xs text-red-500 hover:underline text-left">
                            Hapus gambar
                          </button>
                        )}
                      </div>
                      <input ref={iconInputRef} type="file" accept="image/*" className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadIcon(f); e.target.value = ""; }} />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {EMOJIS.map((e) => (
                        <button key={e} onClick={() => setEditIcon(e)}
                          className={`w-9 h-9 rounded-lg border text-base transition ${editIcon === e ? "border-primary bg-primary/10" : "border-gray-200 hover:bg-gray-50"}`}>
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Nama</label>
                    <input className="input-base mt-1" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Deskripsi</label>
                    <textarea className="input-base mt-1 resize-none" rows={3} value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)} placeholder="Tujuan channel ini…" />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setEditMode(false)}
                      className="flex-1 h-9 rounded-lg border border-gray-300 text-sm text-gray-600 hover:bg-gray-50 transition">
                      Batal
                    </button>
                    <button onClick={saveEdit} disabled={saving}
                      className="flex-1 h-9 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primaryhover disabled:opacity-60 transition">
                      {saving ? "Menyimpan…" : "Simpan"}
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  {convo?.description ? (
                    <p className="text-sm text-gray-700 mb-3">{convo.description}</p>
                  ) : (
                    <p className="text-sm text-gray-400 italic mb-3">Belum ada deskripsi.</p>
                  )}
                  {convo?.parent && (
                    <p className="text-xs text-gray-500 mb-3">Sub-group dari: <span className="font-medium">{convo.parent.name}</span></p>
                  )}
                  {canEdit && (
                    <button onClick={() => setEditMode(true)}
                      className="flex items-center gap-1.5 text-sm text-primary hover:underline">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Edit info group
                    </button>
                  )}
                </div>
              )}
            </section>
          )}

          {/* ── Sub-groups section (level1 topics only) ── */}
          {!isDM && !convo?.parentId && (convo?.subTopics?.length ?? 0) > 0 && (
            <section className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Sub-group ({convo!.subTopics!.length})
              </h3>
              <div className="space-y-1">
                {convo!.subTopics!.map((sub) => (
                  <button
                    key={sub.id}
                    onClick={() => { openConversation(sub.id); onClose(); }}
                    className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-gray-50 transition text-left"
                  >
                    <span className="w-8 h-8 rounded-lg border border-gray-200 flex items-center justify-center text-base shrink-0 bg-gray-50">
                      {sub.icon || "#"}
                    </span>
                    <span className="flex-1 min-w-0 text-sm font-medium text-gray-800 truncate">{sub.name}</span>
                    <svg className="w-4 h-4 text-gray-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="m9 18 6-6-6-6"/></svg>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* ── Members section ── */}
          <section className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Anggota ({members.length})
              </h3>
            </div>

            {/* Search */}
            <input
              className="input-base mb-3 !py-1.5 text-sm"
              placeholder="Cari anggota…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />

            {membersLoading ? (
              <div className="space-y-2">
                {[1,2,3].map((i) => <div key={i} className="h-10 rounded-lg bg-gray-100 animate-pulse" />)}
              </div>
            ) : (
              <>
                {/* Current members */}
                <div className="space-y-1 mb-4">
                  {filteredMembers.map((m) => (
                    <div key={m.user.id} className="flex items-center gap-2.5 py-1.5 group">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shrink-0"
                        style={{ background: m.user.status === "online" ? "#2BAC76" : "#9CA3AF" }}>
                        {m.user.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 truncate">{m.user.name}</div>
                        <div className="text-xs text-gray-500 truncate">
                          {m.role === "MANAGER" ? "Admin Group" : m.role === "ADMIN" ? "Admin Group" : "Anggota"}
                          {" · "}
                          {m.user.role === "SUPER_ADMIN" ? "Super Admin" : m.user.role === "ADMIN" ? "Admin" : m.user.role === "MANAGER" ? "Manager" : "Staff"}
                        </div>
                      </div>
                      {m.user.status === "online" && (
                        <span className="text-[10px] text-green-600 font-medium shrink-0">● Online</span>
                      )}
                      {canManageMembers && m.user.id !== myId && (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                          {/* Toggle admin/member role */}
                          <button
                            onClick={() => updateMemberRole(m.user.id, m.role === "MANAGER" ? "STAFF" : "MANAGER")}
                            className="w-6 h-6 rounded flex items-center justify-center text-blue-500 hover:bg-blue-50 transition text-[10px] shrink-0"
                            title={m.role === "MANAGER" ? "Turunkan jadi Anggota" : "Jadikan Admin Group"}>
                            {m.role === "MANAGER" ? "↓" : "★"}
                          </button>
                          <button
                            onClick={() => removeMember(m.user.id, m.user.name)}
                            className="w-6 h-6 rounded flex items-center justify-center text-red-500 hover:bg-red-50 transition text-xs shrink-0"
                            title="Hapus dari group">
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Add members */}
                {canManageMembers && nonMembers.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tambah Anggota</p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {nonMembers.map((u) => (
                        <button key={u.id}
                          onClick={() => addMember(u.id)}
                          disabled={addingIds.includes(u.id)}
                          className="w-full flex items-center gap-2.5 py-1.5 px-1 rounded-lg hover:bg-gray-50 text-left transition disabled:opacity-50">
                          <div className="w-8 h-8 rounded-lg bg-gray-200 flex items-center justify-center text-gray-600 text-xs font-bold shrink-0">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{u.name}</div>
                            <div className="text-xs text-gray-500 truncate">{u.email}{u.division ? ` · ${u.division}` : ""}</div>
                          </div>
                          <span className="text-primary text-xs font-semibold shrink-0">
                            {addingIds.includes(u.id) ? "…" : "+ Tambah"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>

          {/* ── Admin actions (admin only) ── */}
          {isAdminish && !isDM && (
            <section className="px-5 py-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Admin</p>
              {/* Public / Member-only — clear status + action */}
              <div className="mb-3 p-3 rounded-lg border border-gray-200 bg-gray-50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Visibilitas Group</span>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                    isPublic
                      ? "bg-green-100 text-green-700 border border-green-200"
                      : "bg-gray-200 text-gray-600 border border-gray-300"
                  }`}>
                    {isPublic ? "🌐 Public" : "🔒 Member Only"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mb-2">
                  {isPublic
                    ? "Semua user dapat melihat dan bergabung ke group ini."
                    : "Hanya anggota yang diundang yang bisa melihat group ini."}
                </p>
                <button
                  onClick={togglePublic}
                  className={`w-full h-8 rounded-lg text-xs font-semibold transition border ${
                    isPublic
                      ? "bg-white border-gray-300 text-gray-700 hover:bg-gray-100"
                      : "bg-white border-green-300 text-green-700 hover:bg-green-50"
                  }`}>
                  {isPublic ? "Jadikan Member Only" : "Jadikan Public"}
                </button>
              </div>
              {/* Pin/unpin */}
              <button
                onClick={togglePinnedTop}
                className={`w-full h-9 rounded-lg border text-sm font-semibold transition mb-2 ${
                  (convo as any)?.isPinnedTop
                    ? "bg-yellow-50 border-yellow-200 text-yellow-700 hover:bg-yellow-100"
                    : "bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100"
                }`}>
                {(convo as any)?.isPinnedTop ? "★ Hapus dari Pinned" : "☆ Tambahkan ke Pinned"}
              </button>
              {/* Archive / Unarchive */}
              <button
                onClick={async () => {
                  const isArchived = !!(convo as any)?.isArchived;
                  const action = isArchived ? "Unarchive" : "Archive";
                  const ok = await confirm({
                    title: `${action} Group`,
                    message: isArchived
                      ? `Unarchive group "${convo?.name}"? Group akan muncul kembali di sidebar semua member.`
                      : `Archive group "${convo?.name}"? Group akan disembunyikan dari sidebar semua member.`,
                    confirmLabel: action,
                    danger: !isArchived,
                  });
                  if (!ok) return;
                  try {
                    await api(`/api/conversations/${conversationId}/archive`, {
                      method: "PATCH",
                      body: { archived: !isArchived },
                    });
                    await loadSidebar();
                    toast(isArchived ? "Group berhasil di-unarchive" : "Group berhasil di-archive");
                    if (!isArchived) onClose();
                  } catch (e: any) { toast(e?.message || "Gagal archive"); }
                }}
                className={`w-full h-9 rounded-lg text-sm font-semibold transition border ${
                  (convo as any)?.isArchived
                    ? "bg-green-50 border-green-200 text-green-700 hover:bg-green-100"
                    : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
                }`}>
                {(convo as any)?.isArchived ? "📂 Unarchive Group" : "📦 Archive Group"}
              </button>
              {/* Delete — not for system channels */}
              {!(convo as any)?.isPinnedTop && (
                <button
                  onClick={deleteConversation}
                  className="w-full h-9 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-100 transition">
                  🗑 Hapus Group Permanen
                </button>
              )}
            </section>
          )}

          {/* ── DM danger zone — only when other user no longer exists ── */}
          {isDM && perms?.canDeleteDM && (
            <section className="px-5 py-4 border-t border-gray-100 mt-auto">
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Danger Zone</h3>
              <button
                onClick={deleteDM}
                className="w-full h-9 rounded-lg bg-red-50 border border-red-200 text-red-600 text-sm font-semibold hover:bg-red-100 transition">
                🗑 Hapus Percakapan Ini
              </button>
              <p className="text-xs text-gray-400 mt-2 text-center">Pengguna ini sudah tidak ada. Semua pesan akan dihapus permanen.</p>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
