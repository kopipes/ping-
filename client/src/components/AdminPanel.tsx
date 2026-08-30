import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { useUIStore } from "../store/ui";
import { api } from "../lib/api";
import { useModal } from "./Modal";

type AdminTab = "stats" | "users" | "pending" | "topics" | "divisions" | "auditlog" | "retention";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Stats {
  messages: { today: number; week: number; month: number; total: number };
  users: { total: number; active7: number; active30: number };
  topTopics: { conversationId: string; name: string; count: number }[];
  attachmentDist: Record<string, number>;
}
interface Storage {
  totalBytes: number;
  countByType: Record<string, number>;
  perTopic: { conversationId: string; name: string; bytes: number }[];
}
interface User {
  id: string; name: string; email: string; role: string;
  division: string | null; status: string; createdAt: string;
}
interface Topic {
  id: string; name: string | null; type: string; parentId: string | null;
  isArchived: boolean; isReadOnly: boolean; isPinnedTop: boolean; icon: string | null;
  owner?: { id: string; name: string } | null;
  members?: { id: string; user: { id: string; name: string } }[];
}
interface AuditEntry {
  id: string; action: string; targetId: string | null;
  metadata: string | null; createdAt: string;
  user: { id: string; name: string; email: string };
}
interface RetentionPolicy { mode: "forever" | "auto-archive"; months?: number }

const ROLES = ["STAFF", "MANAGER", "ADMIN", "SUPER_ADMIN"];

function fmt(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── Main AdminPanel ──────────────────────────────────────────────────────────
export function AdminPanel() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setAdminOpen = useUIStore((s) => s.setAdminOpen);
  const [tab, setTab] = useState<AdminTab>("stats");

  if (!user || (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN")) {
    return (
      <div className="h-full flex items-center justify-center text-textm">
        Akses ditolak — hanya Admin dan Super Admin
      </div>
    );
  }

  const isSuperAdmin = user.role === "SUPER_ADMIN";

  const tabs: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
    { key: "stats",    label: "Dashboard", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
    { key: "users",    label: "Users",     icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="9" cy="7" r="4"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/><path d="M21 21v-2a4 4 0 0 0-3-3.85"/></svg> },
    { key: "pending",  label: "Pending",   icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg> },
    { key: "topics",   label: "Groups",    icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg> },
    { key: "divisions",label: "Divisions", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 6h18M3 12h18M3 18h18"/></svg> },
    { key: "auditlog", label: "Audit Log", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg> },
    ...(isSuperAdmin ? [{ key: "retention" as AdminTab, label: "Retention", icon: <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg> }] : []),
  ];

  return (
    <div className="h-full flex flex-col bg-appbg">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-5 py-3 border-b border-border bg-white">
        <button onClick={() => setAdminOpen(false)}
          className="w-8 h-8 flex items-center justify-center rounded hover:bg-hover text-textm transition md:hidden">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <h2 className="font-bold text-textp text-[18px] flex-1">⚙️ Admin Dashboard</h2>
        <span className="text-xs bg-sb/10 text-sb px-2 py-1 rounded font-semibold">{user.role}</span>
      </div>

      {/* Tabs */}
      <div className="shrink-0 flex border-b border-border bg-white overflow-x-auto no-scrollbar">
        {tabs.map(({ key, label, icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-2 sm:px-4 h-11 text-sm font-medium whitespace-nowrap border-b-2 transition min-w-0 ${
              tab === key ? "border-primary text-primary" : "border-transparent text-textm hover:text-textp"
            }`}>
            <span className="shrink-0">{icon}</span>
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto slim-scroll">
        {tab === "stats"     && <StatsTab />}
        {tab === "users"     && <UsersTab isSuperAdmin={isSuperAdmin} />}
        {tab === "pending"   && <PendingUsersTab />}
        {tab === "topics"    && <TopicsTab />}
        {tab === "divisions" && <DivisionsTab />}
        {tab === "auditlog"  && <AuditTab />}
        {tab === "retention" && <RetentionTab />}
      </div>
    </div>
  );
}

// ─── Stats Tab ────────────────────────────────────────────────────────────────
function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [storage, setStorage] = useState<Storage | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api<Stats>("/api/admin/dashboard/stats"),
      api<Storage>("/api/admin/dashboard/storage"),
    ]).then(([s, st]) => { setStats(s); setStorage(st); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-5 space-y-6">
      {/* Message counts */}
      <section>
        <SectionTitle>Pesan</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Hari ini", value: stats?.messages.today },
            { label: "7 hari", value: stats?.messages.week },
            { label: "30 hari", value: stats?.messages.month },
            { label: "Total", value: stats?.messages.total },
          ].map(({ label, value }) => (
            <StatCard key={label} label={label} value={String(value ?? "—")} />
          ))}
        </div>
      </section>

      {/* Users */}
      <section>
        <SectionTitle>User</SectionTitle>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[
            { label: "Total", value: stats?.users.total },
            { label: "Aktif 7 hari", value: stats?.users.active7 },
            { label: "Aktif 30 hari", value: stats?.users.active30 },
          ].map(({ label, value }) => (
            <StatCard key={label} label={label} value={String(value ?? "—")} />
          ))}
        </div>
      </section>

      {/* Top topics */}
      {(stats?.topTopics?.length || 0) > 0 && (
        <section>
          <SectionTitle>Topic Teraktif</SectionTitle>
          <div className="border border-border rounded-xl overflow-hidden">
            {stats!.topTopics.map((t, i) => (
              <div key={t.conversationId} className={`flex items-center justify-between px-4 py-3 ${i % 2 ? "bg-hover/50" : ""}`}>
                <span className="text-sm text-textp truncate">{t.name || t.conversationId}</span>
                <span className="text-sm font-bold text-primary shrink-0 ml-2">{t.count} pesan</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Storage */}
      {storage && (
        <section>
          <SectionTitle>Storage — Total {fmt(storage.totalBytes)}</SectionTitle>
          <div className="border border-border rounded-xl overflow-hidden">
            {storage.perTopic.slice(0, 10).map((t, i) => (
              <div key={t.conversationId} className={`flex items-center justify-between px-4 py-3 ${i % 2 ? "bg-hover/50" : ""}`}>
                <span className="text-sm text-textp truncate">{t.name}</span>
                <span className="text-sm font-semibold text-textm shrink-0 ml-2">{fmt(t.bytes)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────
function UsersTab({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [q, setQ] = useState("");
  const { toast, confirm } = useModal();

  const load = () => {
    setLoading(true);
    api<User[]>(`/api/users${q ? `?q=${q}` : ""}`)
      .then((d) => { setUsers(d); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(load, [q]);

  const changeRole = async (userId: string, role: string) => {
    try {
      await api(`/api/admin/users/${userId}/role`, { method: "PATCH", body: { role } });
      setUsers((u) => u.map((x) => x.id === userId ? { ...x, role } : x));
    } catch (e: any) { toast(e?.message || "Gagal ubah role"); }
  };

  const toggleStatus = async (userId: string, currentStatus: string) => {
    const newStatus = currentStatus === "disabled" ? "offline" : "disabled";
    try {
      await api(`/api/admin/users/${userId}/status`, { method: "PATCH", body: { status: newStatus } });
      setUsers((u) => u.map((x) => x.id === userId ? { ...x, status: newStatus } : x));
    } catch (e: any) { toast(e?.message || "Gagal update status"); }
  };

  const deleteUser = async (userId: string, name: string) => {
    const ok = await confirm({ title: "Hapus User", message: `Hapus user "${name}" secara permanen? Tindakan ini tidak bisa dibatalkan.`, confirmLabel: "Hapus", danger: true });
    if (!ok) return;
    try {
      await api(`/api/admin/users/${userId}`, { method: "DELETE" });
      setUsers((u) => u.filter((x) => x.id !== userId));
    } catch (e: any) { toast(e?.message || "Gagal hapus user"); }
  };

  return (
    <div className="p-5">
      <div className="flex items-center gap-3 mb-4">
        <input className="input-base flex-1 !py-2" placeholder="Cari user…" value={q}
          onChange={(e) => setQ(e.target.value)} />
        <button onClick={() => setShowInvite(true)}
          className="shrink-0 px-4 h-9 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primaryhover transition">
          + Tambah User
        </button>
      </div>

      {loading ? <LoadingSpinner /> : (
        <div className="border border-border rounded-xl overflow-hidden">
          {users.length === 0 ? (
            <div className="px-4 py-8 text-center text-textm text-sm">Tidak ada user ditemukan</div>
          ) : users.map((u, i) => (
            <div key={u.id} className={`px-4 py-3 ${i % 2 ? "bg-hover/50" : ""}`}>
              {/* Row 1: avatar + info */}
              <div className="flex items-center gap-2 mb-2">
                <span style={{ backgroundColor: roleColor(u.role), width: 32, height: 32, fontSize: 14, borderRadius: 4 }}
                  className="inline-flex items-center justify-center text-white font-bold shrink-0 uppercase">
                  {u.name.charAt(0)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm text-textp truncate">{u.name}</span>
                    {u.status === "pending" && <Badge label="Menunggu" color="yellow" />}
                    {u.status === "disabled" && <Badge label="Nonaktif" color="red" />}
                    {u.status === "online" && <Badge label="Online" color="green" />}
                  </div>
                  <div className="text-xs text-textm truncate">{u.email}{u.division ? ` · ${u.division}` : ""}</div>
                </div>
              </div>
              {/* Row 2: actions */}
              <div className="flex items-center gap-2 flex-wrap">
                <select value={u.role} onChange={(e) => changeRole(u.id, e.target.value)}
                  disabled={!isSuperAdmin && u.role === "SUPER_ADMIN"}
                  className="text-xs border border-border rounded px-2 py-1 bg-white outline-none focus:border-primary">
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <button onClick={() => setEditingUser(u)}
                  className="px-2 py-1 rounded text-xs border border-border text-textm hover:bg-hover transition">
                  Edit
                </button>
                <button onClick={() => toggleStatus(u.id, u.status)}
                  className={`px-2 py-1 rounded text-xs font-semibold transition ${
                    u.status === "disabled"
                      ? "bg-success/10 text-success hover:bg-success/20"
                      : "bg-danger/10 text-danger hover:bg-danger/20"
                  }`}>
                  {u.status === "disabled" ? "Aktifkan" : "Nonaktifkan"}
                </button>
                {isSuperAdmin && (
                  <button onClick={() => deleteUser(u.id, u.name)}
                    className="px-2 py-1 rounded text-xs font-semibold text-danger bg-danger/10 hover:bg-danger/20 transition">
                    Hapus
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showInvite && <InviteModal onClose={() => { setShowInvite(false); load(); }} />}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={(updated) => {
            setUsers((u) => u.map((x) => x.id === updated.id ? { ...x, ...updated } : x));
            setEditingUser(null);
          }}
        />
      )}
    </div>
  );
}

// ─── Edit User Modal ───────────────────────────────────────────────────────────
function EditUserModal({ user, onClose, onSaved }: {
  user: User;
  onClose: () => void;
  onSaved: (u: Partial<User>) => void;
}) {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [division, setDivision] = useState(user.division || "");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  // Password reset section
  const [showPwReset, setShowPwReset] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwSuccess, setPwSuccess] = useState(false);

  const submit = async () => {
    if (!name.trim()) { setErr("Nama wajib diisi"); return; }
    if (!email.trim()) { setErr("Email wajib diisi"); return; }
    setSaving(true); setErr("");
    try {
      const res = await api<any>(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        body: { name: name.trim(), email: email.trim(), division: division.trim() || undefined },
      });
      onSaved(res);
    } catch (e: any) { setErr(e?.message || "Gagal simpan"); }
    finally { setSaving(false); }
  };

  const submitPwReset = async () => {
    if (newPw.length < 6) { setPwErr("Password minimal 6 karakter"); return; }
    setPwSaving(true); setPwErr("");
    try {
      await api(`/api/admin/users/${user.id}/reset-password`, { method: "POST", body: { password: newPw } });
      setPwSuccess(true);
      setNewPw("");
      setTimeout(() => setPwSuccess(false), 3000);
    } catch (e: any) { setPwErr(e?.message || "Gagal reset password"); }
    finally { setPwSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl fade-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-textp">Edit User</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-hover flex items-center justify-center text-textm">✕</button>
        </div>
        <div className="space-y-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Nama</span>
            <input className="input-base" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Email</span>
            <input className="input-base" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold">Divisi</span>
            <input className="input-base" value={division} onChange={(e) => setDivision(e.target.value)} placeholder="Marketing, IT…" />
          </label>
          {err && <p className="text-sm text-danger">{err}</p>}
          <button onClick={submit} disabled={saving}
            className="w-full h-10 rounded-lg bg-primary text-white font-semibold text-sm hover:bg-primaryhover disabled:opacity-60">
            {saving ? "Menyimpan…" : "Simpan"}
          </button>

          {/* Password reset section */}
          <div className="border-t border-border pt-3">
            <button onClick={() => setShowPwReset(!showPwReset)}
              className="text-sm text-primary font-medium hover:underline">
              {showPwReset ? "▲ Sembunyikan" : "🔑 Reset Password"}
            </button>
            {showPwReset && (
              <div className="mt-2 space-y-2">
                <input className="input-base" type="password" value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="Password baru (min. 6 karakter)" />
                {pwErr && <p className="text-xs text-danger">{pwErr}</p>}
                {pwSuccess && <p className="text-xs text-success font-medium">Password berhasil direset!</p>}
                <button onClick={submitPwReset} disabled={pwSaving}
                  className="w-full h-9 rounded-lg bg-warning/90 text-white font-semibold text-sm hover:bg-warning disabled:opacity-60">
                  {pwSaving ? "Menyimpan…" : "Simpan Password Baru"}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Invite Modal ─────────────────────────────────────────────────────────────
function InviteModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("STAFF");
  const [division, setDivision] = useState("");
  const [password, setPassword] = useState("");
  const [result, setResult] = useState<{ name: string; email: string; tempPassword: string } | null>(null);
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name || !email) { setErr("Nama dan email wajib diisi"); return; }
    if (password && password.length < 6) { setErr("Password minimal 6 karakter"); return; }
    setSaving(true); setErr("");
    try {
      const res = await api<any>("/api/users/invite", {
        method: "POST",
        body: { name, email, role, division, password: password || undefined },
      });
      setResult({ name: res.name, email: res.email, tempPassword: res.tempPassword });
    } catch (e: any) { setErr(e?.message || "Gagal invite"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-2xl fade-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-textp text-lg">Tambah User Baru</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-hover flex items-center justify-center text-textm">✕</button>
        </div>

        {result ? (
          <div className="space-y-3">
            <p className="text-sm text-success font-semibold">✓ User berhasil dibuat!</p>
            <div className="bg-hover rounded-xl p-4 space-y-1 text-sm">
              <div><span className="text-textm">Nama:</span> <span className="font-semibold">{result.name}</span></div>
              <div><span className="text-textm">Email:</span> <span className="font-semibold">{result.email}</span></div>
              <div><span className="text-textm">Password:</span> <code className="bg-white border border-border rounded px-2 py-0.5 text-primary font-bold select-all">{result.tempPassword}</code></div>
            </div>
            <p className="text-xs text-textm">Bagikan kredensial ini ke user.</p>
            <button onClick={onClose} className="w-full h-10 rounded-lg bg-primary text-white font-semibold text-sm hover:bg-primaryhover">Tutup</button>
          </div>
        ) : (
          <div className="space-y-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Nama</span>
              <input className="input-base" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama lengkap" autoFocus />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Email</span>
              <input type="email" className="input-base" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@perusahaan.com" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Password <span className="font-normal text-textm">(kosongkan untuk auto-generate)</span></span>
              <input type="password" className="input-base" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min. 6 karakter" autoComplete="new-password" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Role</span>
                <select className="input-base" value={role} onChange={(e) => setRole(e.target.value)}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold">Divisi</span>
                <input className="input-base" value={division} onChange={(e) => setDivision(e.target.value)} placeholder="Marketing, IT…" />
              </label>
            </div>
            {err && <p className="text-sm text-danger">{err}</p>}
            <button onClick={submit} disabled={saving}
              className="w-full h-10 rounded-lg bg-primary text-white font-semibold text-sm hover:bg-primaryhover disabled:opacity-60">
              {saving ? "Memproses…" : "Buat Akun"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Topics Tab ───────────────────────────────────────────────────────────────
function TopicsTab() {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [managingId, setManagingId] = useState<string | null>(null);
  const { toast, confirm } = useModal();

  const load = () => {
    setLoading(true);
    api<{ level1: Topic[]; pinnedTop: Topic[] }>("/api/conversations")
      .then((d) => {
        const all = [...(d.pinnedTop || []), ...(d.level1 || [])];
        setTopics(all);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  };
  useEffect(load, []);

  const archiveTopic = async (id: string, archive: boolean) => {
    try {
      await api(`/api/conversations/${id}/archive`, { method: "PATCH", body: { archived: archive } });
      setTopics((ts) => ts.map((t) => t.id === id ? { ...t, isArchived: archive } : t));
    } catch (e: any) { toast(e?.message || "Gagal archive"); }
  };

  const togglePinnedTop = async (id: string, val: boolean) => {
    try {
      await api(`/api/admin/conversations/${id}/pinned-top`, { method: "PATCH", body: { isPinnedTop: val } });
      setTopics((ts) => ts.map((t) => t.id === id ? { ...t, isPinnedTop: val } : t));
    } catch (e: any) { toast(e?.message || "Gagal update"); }
  };

  const toggleReadOnly = async (id: string, val: boolean) => {
    try {
      await api(`/api/admin/conversations/${id}/read-only`, { method: "PATCH", body: { isReadOnly: val } });
      setTopics((ts) => ts.map((t) => t.id === id ? { ...t, isReadOnly: val } : t));
    } catch (e: any) { toast(e?.message || "Gagal update"); }
  };

  const deleteConversation = async (id: string, name: string | null, type: string) => {
    const label = type === "DM" ? "DM" : `channel "${name}"`;
    const ok = await confirm({
      title: "Hapus Channel",
      message: `Hapus ${label} secara permanen? Semua pesan dan data akan hilang. Tindakan ini tidak bisa dibatalkan.`,
      confirmLabel: "Hapus",
      danger: true,
    });
    if (!ok) return;
    try {
      await api(`/api/conversations/${id}`, { method: "DELETE" });
      setTopics((ts) => ts.filter((t) => t.id !== id));
      toast(`${label} berhasil dihapus`);
    } catch (e: any) { toast(e?.message || "Gagal hapus"); }
  };

  return (
    <div className="p-5">
      <div className="flex items-center justify-between mb-4">
        <SectionTitle>Semua Group ({topics.length})</SectionTitle>
      </div>
      {loading ? <LoadingSpinner /> : (
        <div className="border border-border rounded-xl overflow-hidden">
          {topics.map((t, i) => (
            <div key={t.id} className={`flex items-center gap-2 px-4 py-3 flex-wrap ${i % 2 ? "bg-hover/50" : ""}`}>
              <span className="text-xl shrink-0">{t.icon || (t.type === "DM" ? "💬" : "📁")}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-textp truncate">
                    {!t.parentId && t.type !== "DM" && <span className="text-textm">#</span>}
                    {t.name || "DM"}
                  </span>
                  {t.isArchived && <Badge label="Archived" color="gray" />}
                  {t.isPinnedTop && <Badge label="★ Starred" color="blue" />}
                  {t.isReadOnly && <Badge label="Read-only" color="yellow" />}
                </div>
                {t.owner && <div className="text-xs text-textm">Owner: {t.owner.name}</div>}
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Toggle starred */}
                <button onClick={() => togglePinnedTop(t.id, !t.isPinnedTop)}
                  title={t.isPinnedTop ? "Hapus dari starred" : "Tambah ke starred"}
                  className={`px-2 py-1 rounded text-xs font-medium transition border ${
                    t.isPinnedTop ? "bg-primary/10 border-primary/30 text-primary" : "border-border text-textm hover:bg-hover"
                  }`}>
                  {t.isPinnedTop ? "★ Unstar" : "☆ Star"}
                </button>
                {/* Toggle read-only */}
                <button onClick={() => toggleReadOnly(t.id, !t.isReadOnly)}
                  title={t.isReadOnly ? "Izinkan semua menulis" : "Jadikan read-only (hanya admin)"}
                  className={`px-2 py-1 rounded text-xs font-medium transition border ${
                    t.isReadOnly ? "bg-warning/10 border-warning/30 text-warning" : "border-border text-textm hover:bg-hover"
                  }`}>
                  {t.isReadOnly ? "🔓 Unlock" : "🔒 Lock"}
                </button>
                {/* Manage members */}
                <button onClick={() => setManagingId(t.id)}
                  className="px-2 py-1 rounded text-xs border border-border text-textm hover:bg-hover transition">
                  Member
                </button>
                {/* Archive/Restore */}
                {!t.isPinnedTop && (
                  <button onClick={() => archiveTopic(t.id, !t.isArchived)}
                    className={`px-2 py-1 rounded text-xs font-semibold transition ${
                      t.isArchived ? "bg-success/10 text-success" : "bg-textm/10 text-textm hover:bg-hover"
                    }`}>
                    {t.isArchived ? "Restore" : "Archive"}
                  </button>
                )}
                {/* Delete — admin only, not for system channels */}
                {!t.isPinnedTop && (
                  <button onClick={() => deleteConversation(t.id, t.name, t.type)}
                    className="px-2 py-1 rounded text-xs font-semibold bg-danger/10 text-danger border border-danger/20 hover:bg-danger/20 transition">
                    🗑 Hapus
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      {managingId && <MemberModal conversationId={managingId} onClose={() => setManagingId(null)} />}
    </div>
  );
}

// ─── Member Management Modal ──────────────────────────────────────────────────
function MemberModal({ conversationId, onClose }: { conversationId: string; onClose: () => void }) {
  const [members, setMembers] = useState<any[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [addId, setAddId] = useState("");
  const { toast } = useModal();

  const load = async () => {
    setLoading(true);
    const [convo, users] = await Promise.all([
      api<any>(`/api/conversations/${conversationId}`),
      api<User[]>("/api/users"),
    ]);
    setMembers(convo.members || []);
    setAllUsers(users);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const nonMembers = allUsers.filter((u) => !members.some((m) => m.user.id === u.id));

  const addMember = async () => {
    if (!addId) return;
    try {
      await api(`/api/conversations/${conversationId}/members`, { method: "POST", body: { userId: addId } });
      await load();
      setAddId("");
    } catch (e: any) { toast(e?.message || "Gagal tambah member"); }
  };

  const removeMember = async (userId: string) => {
    try {
      await api(`/api/conversations/${conversationId}/members/${userId}`, { method: "DELETE" });
      setMembers((m) => m.filter((x) => x.user.id !== userId));
    } catch (e: any) { toast(e?.message || "Gagal hapus member"); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl fade-slide-up max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-bold text-textp">Kelola Member</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-hover flex items-center justify-center text-textm">✕</button>
        </div>
        <div className="p-4 flex-1 overflow-y-auto slim-scroll">
          {loading ? <LoadingSpinner /> : (
            <>
              {/* Add member */}
              {nonMembers.length > 0 && (
                <div className="flex gap-2 mb-4">
                  <select className="input-base flex-1 !py-2 text-sm" value={addId} onChange={(e) => setAddId(e.target.value)}>
                    <option value="">Pilih user untuk ditambahkan…</option>
                    {nonMembers.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.email})</option>)}
                  </select>
                  <button onClick={addMember} disabled={!addId}
                    className="px-3 h-10 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primaryhover disabled:opacity-40 shrink-0">
                    Tambah
                  </button>
                </div>
              )}
              {/* Member list */}
              <div className="space-y-1">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-hover">
                    <span style={{ backgroundColor: roleColor(m.user.role || "STAFF"), width: 28, height: 28, fontSize: 12, borderRadius: 4 }}
                      className="inline-flex items-center justify-center text-white font-bold shrink-0 uppercase">
                      {m.user.name.charAt(0)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-textp truncate">{m.user.name}</div>
                      <div className="text-xs text-textm">{m.role}</div>
                    </div>
                    <button onClick={() => removeMember(m.user.id)}
                      className="text-xs text-danger hover:bg-danger/10 px-2 py-1 rounded transition">
                      Hapus
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Audit Log Tab ────────────────────────────────────────────────────────────
function AuditTab() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const PER_PAGE = 20;

  useEffect(() => {
    setLoading(true);
    api<{ logs: AuditEntry[]; total: number }>(`/api/admin/audit-log?page=${page}&limit=${PER_PAGE}`)
      .then((d) => { setLogs(d.logs); setTotal(d.total); setLoading(false); })
      .catch(() => setLoading(false));
  }, [page]);

  const actionColor = (action: string) => {
    if (action.includes("DELETE") || action.includes("REMOVE")) return "text-danger";
    if (action.includes("CREATE") || action.includes("ADD")) return "text-success";
    if (action.includes("ARCHIVE")) return "text-warning";
    return "text-textm";
  };

  return (
    <div className="p-5">
      <SectionTitle>Audit Log ({total} entries)</SectionTitle>
      {loading ? <LoadingSpinner /> : (
        <>
          <div className="border border-border rounded-xl overflow-hidden">
            {logs.map((l, i) => (
              <div key={l.id} className={`flex items-start gap-3 px-4 py-3 ${i % 2 ? "bg-hover/50" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-bold ${actionColor(l.action)}`}>{l.action}</span>
                    <span className="text-xs text-texts">by <span className="font-medium">{l.user.name}</span></span>
                    {l.targetId && <span className="text-[10px] text-textm font-mono truncate max-w-[120px]">{l.targetId}</span>}
                  </div>
                  {l.metadata && (
                    <div className="text-xs text-textm mt-0.5 truncate font-mono">{l.metadata}</div>
                  )}
                </div>
                <span className="text-[11px] text-textm shrink-0 whitespace-nowrap">
                  {new Date(l.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
          {/* Pagination */}
          <div className="flex items-center justify-center gap-3 mt-4">
            <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
              className="px-4 h-9 rounded-lg border border-border text-sm disabled:opacity-40 hover:bg-hover transition">
              ← Sebelumnya
            </button>
            <span className="text-sm text-textm">Hal {page} dari {Math.ceil(total / PER_PAGE)}</span>
            <button disabled={page * PER_PAGE >= total} onClick={() => setPage(p => p + 1)}
              className="px-4 h-9 rounded-lg border border-border text-sm disabled:opacity-40 hover:bg-hover transition">
              Berikutnya →
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Divisions Tab ────────────────────────────────────────────────────────────
function DivisionsTab() {
  const [divisions, setDivisions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDiv, setNewDiv] = useState("");
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api<{ divisions: string[] }>("/api/admin/divisions")
      .then((d) => { setDivisions(d.divisions); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(load, []);

  const save = async (updated: string[]) => {
    setSaving(true);
    try { await api("/api/admin/divisions", { method: "PUT", body: { divisions: updated } }); }
    catch (e: any) { alert(e?.message || "Gagal simpan"); }
    finally { setSaving(false); }
  };

  const add = async () => {
    const val = newDiv.trim();
    if (!val || divisions.includes(val)) return;
    const updated = [...divisions, val];
    setDivisions(updated);
    setNewDiv("");
    await save(updated);
  };

  const remove = async (d: string) => {
    const updated = divisions.filter((x) => x !== d);
    setDivisions(updated);
    await save(updated);
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-5 max-w-lg">
      <SectionTitle>Master Data Divisi</SectionTitle>
      <p className="text-sm text-textm mb-4">Daftar divisi ini digunakan sebagai pilihan saat registrasi dan edit profil pengguna.</p>

      {/* Add new */}
      <div className="flex gap-2 mb-4">
        <input className="input-base flex-1 !py-2" value={newDiv}
          onChange={(e) => setNewDiv(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="Nama divisi baru…" />
        <button onClick={add} disabled={saving || !newDiv.trim()}
          className="px-4 h-9 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primaryhover disabled:opacity-50 transition">
          + Tambah
        </button>
      </div>

      {/* List */}
      <div className="border border-border rounded-xl overflow-hidden">
        {divisions.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-textm">Belum ada divisi. Tambahkan di atas.</div>
        ) : divisions.map((d, i) => (
          <div key={d} className={`flex items-center gap-3 px-4 py-3 ${i % 2 ? "bg-hover/50" : ""}`}>
            <span className="flex-1 text-sm text-textp">{d}</span>
            <button onClick={() => remove(d)}
              className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-danger hover:bg-danger/10 transition text-xs">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><polyline points="3,6 5,6 21,6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Retention Tab (Super Admin only) ────────────────────────────────────────
function RetentionTab() {
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const { toast, confirm } = useModal();

  // Edit window
  const [editMins, setEditMins] = useState<number>(15);
  const [editSaving, setEditSaving] = useState(false);
  const [editSuccess, setEditSuccess] = useState(false);

  useEffect(() => {
    Promise.all([
      api<RetentionPolicy>("/api/admin/retention-settings"),
      api<{ minutes: number }>("/api/admin/edit-window"),
    ]).then(([p, ew]) => {
      setPolicy(p);
      setEditMins(ew.minutes);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const save = async () => {
    if (!policy) return;
    setSaving(true);
    try { await api("/api/admin/retention-settings", { method: "PATCH", body: policy }); }
    catch (e: any) { toast(e?.message || "Gagal simpan"); }
    finally { setSaving(false); }
  };

  const saveEditWindow = async () => {
    setEditSaving(true);
    try {
      await api("/api/admin/edit-window", { method: "PATCH", body: { minutes: editMins } });
      setEditSuccess(true);
      setTimeout(() => setEditSuccess(false), 3000);
    } catch (e: any) { toast(e?.message || "Gagal simpan"); }
    finally { setEditSaving(false); }
  };

  const runPreview = async () => {
    try { const p = await api<any>("/api/admin/retention/preview"); setPreview(p); }
    catch (e: any) { toast(e?.message || "Gagal preview"); }
  };

  const runArchive = async () => {
    const ok = await confirm({ title: "Jalankan Archive", message: "Jalankan archive sekarang? Proses ini tidak bisa dibatalkan.", confirmLabel: "Jalankan", danger: true });
    if (!ok) return;
    setArchiving(true);
    try {
      const r = await api<any>("/api/admin/retention/run-archive", { method: "POST" });
      toast(`Archive selesai: ${r.archived} pesan diarsipkan.`, "success");
      setPreview(null);
    } catch (e: any) { toast(e?.message || "Gagal archive"); }
    finally { setArchiving(false); }
  };

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-5 max-w-lg space-y-5">

      {/* Edit/Delete window */}
      <SectionTitle>Batas Waktu Edit Pesan</SectionTitle>
      <div className="border border-border rounded-xl p-4 space-y-3">
        <p className="text-sm text-textm">Berapa menit setelah dikirim, pengguna masih bisa mengedit pesannya. Delete tidak dibatasi. Admin selalu bisa edit/hapus kapan saja.</p>
        <label className="flex items-center gap-3">
          <span className="text-sm text-textp">Batas edit</span>
          <input type="number" min={1} max={10080}
            className="input-base !py-1.5 w-24 text-center"
            value={editMins}
            onChange={(e) => setEditMins(Number(e.target.value))} />
          <span className="text-sm text-textp">menit</span>
          <span className="text-xs text-textm">({editMins >= 1440 ? `${(editMins/1440).toFixed(1)} hari` : editMins >= 60 ? `${(editMins/60).toFixed(1)} jam` : ""})</span>
        </label>
        {editSuccess && <p className="text-xs text-success font-medium">Tersimpan!</p>}
        <button onClick={saveEditWindow} disabled={editSaving}
          className="w-full h-9 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primaryhover disabled:opacity-60">
          {editSaving ? "Menyimpan…" : "Simpan Batas Edit"}
        </button>
      </div>

      <SectionTitle>Kebijakan Retensi Data</SectionTitle>
      <div className="border border-border rounded-xl p-4 space-y-4">
        <div className="flex gap-2">
          {["forever", "auto-archive"].map((m) => (
            <button key={m} onClick={() => setPolicy((p) => p ? { ...p, mode: m as any } : { mode: m as any })}
              className={`flex-1 h-9 rounded-lg border text-sm font-medium transition ${
                policy?.mode === m ? "border-primary bg-primary/10 text-primary" : "border-border text-textm hover:bg-hover"
              }`}>
              {m === "forever" ? "Simpan selamanya" : "Auto-archive"}
            </button>
          ))}
        </div>
        {policy?.mode === "auto-archive" && (
          <label className="flex items-center gap-3">
            <span className="text-sm text-textp">Archive pesan lebih tua dari</span>
            <input type="number" min={1} max={60}
              className="input-base !py-1.5 w-20 text-center"
              value={policy.months || 6}
              onChange={(e) => setPolicy((p) => p ? { ...p, months: Number(e.target.value) } : p)} />
            <span className="text-sm text-textp">bulan</span>
          </label>
        )}
        <button onClick={save} disabled={saving}
          className="w-full h-9 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primaryhover disabled:opacity-60">
          {saving ? "Menyimpan…" : "Simpan Pengaturan"}
        </button>
      </div>

      {policy?.mode === "auto-archive" && (
        <div className="border border-border rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold text-textp">Jalankan Archive Manual</p>
          {preview && (
            <div className="bg-hover rounded-lg p-3 text-sm space-y-1">
              <p>Pesan yang akan diarsipkan: <strong>{preview.totalMessages}</strong></p>
              <p>Estimasi storage: <strong>{fmt(preview.totalBytes)}</strong></p>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={runPreview}
              className="flex-1 h-9 rounded-lg border border-border text-sm text-textm hover:bg-hover transition">
              Preview
            </button>
            <button onClick={runArchive} disabled={archiving}
              className="flex-1 h-9 rounded-lg bg-warning text-white text-sm font-semibold hover:bg-warning/80 disabled:opacity-60">
              {archiving ? "Memproses…" : "Jalankan Sekarang"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-border rounded-xl p-4 bg-white">
      <div className="text-2xl font-black text-textp">{value}</div>
      <div className="text-xs text-textm mt-0.5">{label}</div>
    </div>
  );
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-sm font-bold text-textp mb-3">{children}</h4>;
}
function LoadingSpinner() {
  return (
    <div className="py-12 flex items-center justify-center">
      <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}
function Badge({ label, color }: { label: string; color: "blue" | "yellow" | "gray" | "red" | "green" }) {
  const cls = {
    blue: "bg-primary/10 text-primary",
    yellow: "bg-warning/10 text-warning",
    gray: "bg-textm/10 text-textm",
    red: "bg-danger/10 text-danger",
    green: "bg-success/10 text-success",
  }[color];
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${cls}`}>{label}</span>;
}
function roleColor(role: string) {
  return { SUPER_ADMIN: "#E01E5A", ADMIN: "#1264A3", MANAGER: "#2BAC76", STAFF: "#868686" }[role] ?? "#868686";
}

// ─── Pending Users Tab ─────────────────────────────────────────────────────────
function PendingUsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast, confirm } = useModal();

  const load = () => {
    setLoading(true);
    api<any[]>("/api/admin/users/pending")
      .then((d) => { setUsers(d); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(load, []);

  const approve = async (id: string) => {
    try {
      await api(`/api/admin/users/${id}/approve`, { method: "POST" });
      setUsers((u) => u.filter((x) => x.id !== id));
    } catch (e: any) { toast(e?.message || "Gagal approve"); }
  };

  const reject = async (id: string) => {
    const ok = await confirm({ title: "Tolak Pendaftaran", message: "Tolak dan hapus pendaftaran ini?", confirmLabel: "Tolak", danger: true });
    if (!ok) return;
    try {
      await api(`/api/admin/users/${id}/reject`, { method: "POST" });
      setUsers((u) => u.filter((x) => x.id !== id));
    } catch (e: any) { toast(e?.message || "Gagal reject"); }
  };

  return (
    <div className="p-5">
      <SectionTitle>Pendaftaran Menunggu Persetujuan ({users.length})</SectionTitle>
      {loading ? <LoadingSpinner /> : users.length === 0 ? (
        <div className="py-10 text-center text-textm text-sm">Tidak ada pendaftaran baru</div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          {users.map((u, i) => (
            <div key={u.id} className={`flex items-center gap-3 px-4 py-3 ${i % 2 ? "bg-hover/50" : ""}`}>
              <span style={{ backgroundColor: "#868686", width: 32, height: 32, fontSize: 13, borderRadius: 4 }}
                className="inline-flex items-center justify-center text-white font-bold shrink-0 uppercase">
                {u.name.charAt(0)}
              </span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm text-textp truncate">{u.name}</div>
                <div className="text-xs text-textm truncate">{u.email}{u.division ? ` · ${u.division}` : ""}</div>
                <div className="text-[11px] text-textm">{new Date(u.createdAt).toLocaleString()}</div>
              </div>
              <button onClick={() => approve(u.id)}
                className="shrink-0 px-3 h-8 rounded-lg bg-success/10 text-success text-xs font-semibold hover:bg-success/20 transition">
                ✓ Approve
              </button>
              <button onClick={() => reject(u.id)}
                className="shrink-0 px-3 h-8 rounded-lg bg-danger/10 text-danger text-xs font-semibold hover:bg-danger/20 transition">
                ✕ Tolak
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}