import { useEffect, useState } from "react";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chat";
import { api } from "../lib/api";

export function NewTopicModal({ onClose }: { onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const loadSidebar = useChatStore((s) => s.loadSidebar);
  const sidebar = useChatStore((s) => s.sidebar);
  const openConversation = useChatStore((s) => s.openConversation);

  // MANAGER+ can create Level 1 groups
  const canCreateL1 = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN" || user?.role === "MANAGER";
  const parents = sidebar?.level1 || [];

  const [name, setName] = useState("");
  const [icon, setIcon] = useState("📁");
  const [parentId, setParentId] = useState<string>("");
  const [type, setType] = useState<"level1" | "sub">(canCreateL1 ? "level1" : "sub");
  const [description, setDescription] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // Member selection
  const [allUsers, setAllUsers] = useState<{ id: string; name: string; email: string; division: string | null }[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    api<any[]>("/api/users").then((users) => {
      setAllUsers(users.filter((u: any) => u.id !== user?.id));
    }).catch(() => {});
  }, []);

  const emojis = ["📁", "🚀", "🎯", "🧠", "📊", "🛠️", "🖥️", "🎨", "📈", "📚", "🏢", "💡", "📋", "🔧", "🌐"];

  const toggleUser = (userId: string) => {
    setSelectedUsers((s) => s.includes(userId) ? s.filter((x) => x !== userId) : [...s, userId]);
  };

  const filteredUsers = allUsers.filter((u) =>
    !userSearch ||
    u.name.toLowerCase().includes(userSearch.toLowerCase()) ||
    u.email.toLowerCase().includes(userSearch.toLowerCase())
  );

  const submit = async () => {
    if (!name.trim()) { setErr("Nama group wajib diisi"); return; }
    if (type === "sub" && !parentId) { setErr("Pilih group parent untuk sub-group"); return; }
    setSaving(true);
    setErr("");
    try {
      const res = await api<{ conversationId: string }>("/api/conversations", {
        method: "POST",
        body: {
          name: name.trim(),
          icon,
          description: description || undefined,
          ...(type === "sub" ? { parentId } : {}),
        },
      });

      // Add selected members to the new channel
      if (selectedUsers.length > 0) {
        await Promise.all(
          selectedUsers.map((userId) =>
            api(`/api/conversations/${res.conversationId}/members`, {
              method: "POST",
              body: { userId },
            }).catch(() => {})
          )
        );
      }

      await loadSidebar();
      openConversation(res.conversationId);
      onClose();
    } catch (e: any) {
      setErr(e?.message || "Gagal membuat group");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center">
      <div className="w-full sm:max-w-lg bg-white rounded-t-2xl sm:rounded-2xl fade-slide-up max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-lg font-bold text-textp">Buat Group Baru</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-hover flex items-center justify-center text-textm">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Level 1 or Sub-group toggle — only for MANAGER+ */}
          {canCreateL1 && parents.length > 0 && (
            <div className="flex gap-2">
              <button onClick={() => setType("level1")}
                className={`flex-1 h-10 rounded-lg border text-sm font-medium ${type === "level1" ? "border-primary bg-primary/10 text-primary" : "border-border text-textm"}`}>
                Group Baru
              </button>
              <button onClick={() => setType("sub")}
                className={`flex-1 h-10 rounded-lg border text-sm font-medium ${type === "sub" ? "border-primary bg-primary/10 text-primary" : "border-border text-textm"}`}>
                Sub-group
              </button>
            </div>
          )}

          {/* Parent selection for sub-group */}
          {type === "sub" && parents.length > 0 && (
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold text-textp">Group Parent</span>
              <select className="input-base" value={parentId} onChange={(e) => setParentId(e.target.value)}>
                <option value="">Pilih group…</option>
                {parents.map((p) => <option key={p.id} value={p.id}>{p.icon} {p.name}</option>)}
              </select>
            </label>
          )}

          {/* Name */}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-textp">Nama</span>
            <input className="input-base" value={name} onChange={(e) => setName(e.target.value)}
              placeholder={type === "sub" ? "Contoh: Sprint Q4, Bug Report" : "Contoh: Marketing, Engineering"}
              autoFocus />
          </label>

          {/* Icon */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-textp">Ikon</span>
            <div className="flex flex-wrap gap-2">
              {emojis.map((e) => (
                <button key={e} onClick={() => setIcon(e)}
                  className={`h-9 w-9 rounded-lg border text-base transition ${icon === e ? "border-primary bg-primary/10" : "border-border hover:bg-hover"}`}>
                  {e}
                </button>
              ))}
            </div>
          </div>

          {/* Description */}
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-textp">Deskripsi <span className="font-normal text-textm">(opsional)</span></span>
            <textarea className="input-base resize-none" rows={2} value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Tujuan dan topik group ini…" />
          </label>

          {/* Member selection */}
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold text-textp">
              Tambah Anggota
              <span className="font-normal text-textm ml-1">
                — hanya anggota yang bisa melihat group ini
                {selectedUsers.length > 0 && <span className="text-primary ml-1">({selectedUsers.length} dipilih)</span>}
              </span>
            </span>
            <input className="input-base" placeholder="Cari user…" value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)} />
            <div className="max-h-44 overflow-y-auto border border-border rounded-lg divide-y divide-border">
              {filteredUsers.length === 0 ? (
                <div className="px-3 py-4 text-sm text-textm text-center">Tidak ada user ditemukan</div>
              ) : filteredUsers.map((u) => {
                const selected = selectedUsers.includes(u.id);
                return (
                  <button key={u.id} onClick={() => toggleUser(u.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-left transition ${selected ? "bg-primary/5" : "hover:bg-hover"}`}>
                    <span className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs shrink-0 transition ${selected ? "bg-primary border-primary text-white" : "border-border"}`}>
                      {selected && "✓"}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-textp truncate">{u.name}</div>
                      <div className="text-xs text-textm truncate">{u.email}{u.division ? ` · ${u.division}` : ""}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-5 py-4 border-t border-border">
          {err && <p className="text-sm text-danger mb-3">{err}</p>}
          <div className="flex gap-2">
            <button onClick={onClose} className="flex-1 h-10 rounded-lg border border-border text-sm text-textm hover:bg-hover transition">
              Batal
            </button>
            <button onClick={submit} disabled={saving}
              className="flex-1 h-10 rounded-lg bg-primary text-white text-sm font-bold hover:bg-primaryhover disabled:opacity-60 transition">
              {saving ? "Membuat…" : "Buat Group"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}