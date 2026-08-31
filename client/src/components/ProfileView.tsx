import { useRef, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import i18n, { LANGUAGES } from "../i18n";
import { useAuthStore } from "../store/auth";
import { useChatStore } from "../store/chat";
import { useUIStore } from "../store/ui";
import { api, apiUrl } from "../lib/api";
import { useModal } from "./Modal";
import imageCompression from "browser-image-compression";
import {
  isPushSupported,
  isPushSubscribed,
  subscribeToPush,
  unsubscribeFromPush,
  getNotificationPermission,
} from "../lib/push";

const THEMES = [
  { key: "navy",     label: "Navy",      rail: "#111D33", sidebar: "#1A2540", brand: "#2E46E0", description: "Signal Blue — default" },
  { key: "slate",    label: "Slate",     rail: "#0F172A", sidebar: "#1E293B", brand: "#4F46E5", description: "Deep Indigo" },
  { key: "forest",   label: "Forest",    rail: "#0D1F1A", sidebar: "#14302A", brand: "#059669", description: "Emerald Green" },
  { key: "charcoal", label: "Charcoal",  rail: "#18181B", sidebar: "#27272A", brand: "#52525B", description: "Warm Gray" },
  { key: "bordeaux", label: "Bordeaux",  rail: "#1A0E14", sidebar: "#2D1520", brand: "#E11D48", description: "Deep Rose" },
  { key: "sakura",   label: "Sakura",    rail: "#4A1A2A", sidebar: "#6B2D3E", brand: "#EC4899", description: "Soft Pink" },
  { key: "ocean",    label: "Ocean",     rail: "#0A2A35", sidebar: "#0F3D4A", brand: "#06B6D4", description: "Soft Teal" },
  { key: "lavender", label: "Lavender",  rail: "#2D1B4E", sidebar: "#3D2566", brand: "#8B5CF6", description: "Soft Purple" },
  { key: "peach",    label: "Peach",     rail: "#3D1A0A", sidebar: "#5C2D12", brand: "#F97316", description: "Soft Orange" },
  { key: "mint",     label: "Mint",      rail: "#0A2E1E", sidebar: "#14402A", brand: "#22C55E", description: "Soft Green" },
  { key: "light",    label: "Light",     rail: "#E8EDF5", sidebar: "#F0F4FA", brand: "#2E46E0", description: "Light Mode", adminOnly: true },
] as const;

type ThemeKey = typeof THEMES[number]["key"];

function applyTheme(key: ThemeKey) {
  document.documentElement.setAttribute("data-theme", key);
  localStorage.setItem("pvc-theme", key);
}

const FONT_SIZES = [
  { key: "small",  label: "Kecil",  px: "13px", zoom: "0.867" },
  { key: "normal", label: "Normal", px: "15px", zoom: "1"     },
  { key: "large",  label: "Besar",  px: "18px", zoom: "1.2"   },
] as const;

type FontSizeKey = "small" | "normal" | "large";

function applySidebarFontSize(key: FontSizeKey) {
  const size = FONT_SIZES.find((f) => f.key === key);
  if (size) {
    document.documentElement.style.setProperty("--sidebar-zoom", size.zoom);
    localStorage.setItem("pvc-font-sidebar", key);
  }
}

function applyChatFontSize(key: FontSizeKey) {
  const size = FONT_SIZES.find((f) => f.key === key);
  if (size) {
    document.documentElement.style.setProperty("--chat-zoom", size.zoom);
    localStorage.setItem("pvc-font-chat", key);
  }
}

const CHAT_BG_PRESETS = [
  { label: "Putih",        value: "#FFFFFF" },
  { label: "Abu Muda",     value: "#F0F4F9" },
  { label: "Krem",         value: "#FDF6EC" },
  { label: "Mint",         value: "#EDF7F2" },
  { label: "Lavender",     value: "#F0EDF7" },
  { label: "Biru Muda",    value: "#EDF2FC" },
  { label: "Gelap",        value: "#1E2D3D" },
];

function applyChatBg(color: string) {
  document.documentElement.style.setProperty("--chat-bg", color);
  localStorage.setItem("pvc-chat-bg", color);
}

export function ProfileView({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const reset = useChatStore((s) => s.reset);
  const setMobileTab = useUIStore((s) => s.setMobileTab);
  const { toast } = useModal();
  const avatarRef = useRef<HTMLInputElement>(null);

  // Profile editing state
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user?.name || "");
  const [division, setDivision] = useState(user?.division || "");
  const [divisionOptions, setDivisionOptions] = useState<string[]>([]);
  const [saveErr, setSaveErr] = useState("");
  const [saving, setSaving] = useState(false);

  // Avatar upload
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Password change
  const [showPwChange, setShowPwChange] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwSaving, setPwSaving] = useState(false);

  // Font sizes
  const [sidebarFontSize, setSidebarFontSize] = useState<FontSizeKey>(
    (localStorage.getItem("pvc-font-sidebar") as FontSizeKey) || "normal"
  );
  const [chatFontSize, setChatFontSize] = useState<FontSizeKey>(
    (localStorage.getItem("pvc-font-chat") as FontSizeKey) || "normal"
  );

  // Color theme
  const [theme, setTheme] = useState<ThemeKey>(
    (localStorage.getItem("pvc-theme") as ThemeKey) || "navy"
  );

  // Chat background
  const [chatBg, setChatBg] = useState(
    localStorage.getItem("pvc-chat-bg") || "#FFFFFF"
  );

  // Push notifications
  const pushSupported = isPushSupported();
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(false);
  const pushPermission = pushSupported ? getNotificationPermission() : "denied";

  useEffect(() => {
    if (!pushSupported) return;
    isPushSubscribed().then(setPushSubscribed).catch(() => {});
  }, [pushSupported]);

  // Load division options
  useEffect(() => {
    api<{ divisions: string[] }>("/api/users/divisions")
      .then((d) => setDivisionOptions(d.divisions))
      .catch(() => {});
  }, []);

  if (!user) return null;

  const setLocale = (code: string) => {
    i18n.changeLanguage(code);
    localStorage.setItem("pvc-locale", code);
    setUser({ ...user, locale: code });
  };

  const onLogout = async () => { reset(); await logout(); };

  const onSaveProfile = async () => {
    if (!name.trim()) { setSaveErr("Nama tidak boleh kosong"); return; }
    setSaving(true); setSaveErr("");
    try {
      const updated = await api<typeof user>("/api/users/me", {
        method: "PATCH",
        body: { name: name.trim(), division: division.trim() || undefined },
      });
      setUser({ ...user, ...updated });
      setEditing(false);
    } catch (e: any) { setSaveErr(e?.message || "Gagal menyimpan"); }
    finally { setSaving(false); }
  };

  const onChangePassword = async () => {
    if (!currentPw || !newPw || !confirmPw) { setPwErr("Semua field wajib diisi"); return; }
    if (newPw.length < 6) { setPwErr("Password baru minimal 6 karakter"); return; }
    if (newPw !== confirmPw) { setPwErr("Konfirmasi password tidak sama"); return; }
    setPwSaving(true); setPwErr("");
    try {
      await api("/api/users/me/change-password", {
        method: "POST",
        body: { currentPassword: currentPw, newPassword: newPw },
      });
      setPwSuccess(true);
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
      setTimeout(() => { setPwSuccess(false); setShowPwChange(false); }, 2000);
    } catch (e: any) { setPwErr(e?.message || "Gagal ganti password"); }
    finally { setPwSaving(false); }
  };

  const onAvatarPick = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setAvatarUploading(true);
    try {
      let uploadFile: File = file;
      if (file.type.startsWith("image/")) {
        try { uploadFile = await imageCompression(file, { maxSizeMB: 0.5, maxWidthOrHeight: 400, useWebWorker: true }); } catch {}
      }
      const form = new FormData();
      form.append("file", uploadFile, file.name);
      const res = await api<{ fileUrl: string; thumbnailUrl: string | null }>("/api/upload", { method: "POST", formData: form });
      const avatarUrl = res.thumbnailUrl || res.fileUrl;
      await api("/api/users/me", { method: "PATCH", body: { avatarUrl } });
      setUser({ ...user, avatarUrl });
    } catch (e: any) { toast("Upload gagal: " + (e?.message || "")); }
    finally { setAvatarUploading(false); }
  };

  const onSidebarFontSize = (key: FontSizeKey) => { setSidebarFontSize(key); applySidebarFontSize(key); };
  const onChatFontSize = (key: FontSizeKey) => { setChatFontSize(key); applyChatFontSize(key); };
  const statusText = user.status === "online" ? t("profile.online") : user.status === "away" ? t("profile.away") : t("profile.offline");

  return (
    <div className="h-full overflow-y-auto slim-scroll bg-appbg">
      {/* Avatar + info header */}
      <div className="bg-white px-5 pt-6 pb-5 border-b border-border">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            {user.avatarUrl ? (
              <img src={apiUrl(user.avatarUrl)} alt={user.name} className="w-20 h-20 rounded-xl object-cover border border-border" />
            ) : (
              <span style={{ backgroundColor: "#1264A3", width: 80, height: 80, fontSize: 28, borderRadius: 12 }}
                className="inline-flex items-center justify-center text-white font-black uppercase">
                {user.name.charAt(0)}
              </span>
            )}
            <button onClick={() => avatarRef.current?.click()} disabled={avatarUploading}
              className="absolute inset-0 rounded-xl bg-black/40 opacity-0 hover:opacity-100 active:opacity-100 transition flex items-center justify-center text-white text-xs font-semibold">
              {avatarUploading ? "…" : "📷 Ganti"}
            </button>
            <span className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${user.status === "online" ? "bg-success" : "bg-textm"}`} />
            <input ref={avatarRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { onAvatarPick(e.target.files); e.target.value = ""; }} />
          </div>

          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="space-y-2">
                <input className="input-base !py-1.5 text-sm" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama" autoFocus />
                {divisionOptions.length > 0 ? (
                  <select className="input-base !py-1.5 text-sm" value={division} onChange={(e) => setDivision(e.target.value)}>
                    <option value="">-- Pilih Divisi --</option>
                    {divisionOptions.map((d) => <option key={d} value={d}>{d}</option>)}
                    <option value={division && !divisionOptions.includes(division) ? division : "__other__"}>Lainnya…</option>
                  </select>
                ) : (
                  <input className="input-base !py-1.5 text-sm" value={division} onChange={(e) => setDivision(e.target.value)} placeholder="Divisi (opsional)" />
                )}
                {saveErr && <p className="text-xs text-danger">{saveErr}</p>}
                <div className="flex gap-2">
                  <button onClick={onSaveProfile} disabled={saving}
                    className="px-3 h-8 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primaryhover disabled:opacity-60">
                    {saving ? "…" : "Simpan"}
                  </button>
                  <button onClick={() => { setEditing(false); setSaveErr(""); }}
                    className="px-3 h-8 rounded-lg border border-border text-xs text-textm hover:bg-hover">
                    Batal
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-textp truncate">{user.name}</h2>
                  <button onClick={() => { setEditing(true); setName(user.name); setDivision(user.division || ""); }}
                    className="text-xs text-primary hover:underline shrink-0">Edit</button>
                </div>
                <p className="text-sm text-texts truncate">{user.email}</p>
                {user.division && <p className="text-sm text-textm">{user.division}</p>}
                <div className="flex items-center gap-1 mt-1 text-xs">
                  <span className={`h-2 w-2 rounded-full ${user.status === "online" ? "bg-success" : "bg-textm"}`} />
                  <span className="text-textm">{statusText}</span>
                  <span className="text-textm">·</span>
                  <span className="text-textm font-medium">{user.role}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-5">
        {/* Change password */}
        <section className="border border-border rounded-xl overflow-hidden">
          <button onClick={() => { setShowPwChange((v) => !v); setPwErr(""); setPwSuccess(false); }}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-hover transition text-left">
            <span className="text-sm font-semibold text-textp">Ganti Password</span>
            <span className="text-textm text-sm">{showPwChange ? "▲" : "▼"}</span>
          </button>
          {showPwChange && (
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              {pwSuccess ? (
                <p className="text-sm text-success font-semibold">✓ Password berhasil diubah</p>
              ) : (
                <>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-texts">Password Lama</span>
                    <input type="password" className="input-base !py-1.5 text-sm" value={currentPw}
                      onChange={(e) => setCurrentPw(e.target.value)} placeholder="Password saat ini" autoComplete="current-password" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-texts">Password Baru</span>
                    <input type="password" className="input-base !py-1.5 text-sm" value={newPw}
                      onChange={(e) => setNewPw(e.target.value)} placeholder="Min. 6 karakter" autoComplete="new-password" />
                  </label>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs font-semibold text-texts">Konfirmasi Password Baru</span>
                    <input type="password" className="input-base !py-1.5 text-sm" value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)} placeholder="Ulangi password baru" autoComplete="new-password" />
                  </label>
                  {pwErr && <p className="text-xs text-danger">{pwErr}</p>}
                  <button onClick={onChangePassword} disabled={pwSaving}
                    className="w-full h-9 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primaryhover disabled:opacity-60">
                    {pwSaving ? "Menyimpan…" : "Ganti Password"}
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        {/* Language */}
        <section>
          <h4 className="text-sm font-semibold text-textp mb-2">{t("profile.language")}</h4>
          <div className="flex gap-2">
            {LANGUAGES.map((l) => (
              <button key={l.code} onClick={() => setLocale(l.code)}
                className={`flex-1 h-10 rounded-xl border font-medium text-sm transition ${
                  i18n.language === l.code ? "bg-primary text-white border-primary" : "bg-white border-border text-texts hover:bg-hover"
                }`}>
                {l.label}
              </button>
            ))}
          </div>
        </section>

        {/* Color Theme */}
        <section>
          <h4 className="text-sm font-semibold text-textp mb-3">Tema Warna</h4>
          <div className="grid grid-cols-5 gap-2">
            {THEMES.filter((t) => !("adminOnly" in t && t.adminOnly) || user?.role === "ADMIN" || user?.role === "SUPER_ADMIN").map((t) => {
              const isActive = theme === t.key;
              const isAdminOnly = "adminOnly" in t && t.adminOnly;
              return (
                <button
                  key={t.key}
                  onClick={() => {
                    setTheme(t.key);
                    applyTheme(t.key);
                  }}
                  title={`${t.label} — ${t.description}`}
                  className={`flex flex-col items-center gap-1.5 p-2 rounded-xl border-2 transition relative ${
                    isActive ? "border-primary bg-primary/5" : "border-border hover:border-gray-300 bg-white"
                  }`}
                >
                  {/* Admin-only badge */}
                  {isAdminOnly && (
                    <span className="absolute top-1 right-1 text-[8px] bg-amber-100 text-amber-700 font-bold px-1 rounded leading-tight">ADM</span>
                  )}
                  {/* Mini preview: rail + sidebar + brand swatch */}
                  <div className="flex rounded-lg overflow-hidden w-full h-8 shrink-0" style={{ border: "1px solid #E5E7EF" }}>
                    <div className="w-2 shrink-0" style={{ background: t.rail }} />
                    <div className="w-4 shrink-0" style={{ background: t.sidebar }} />
                    <div className="flex-1 flex items-center justify-center" style={{ background: "#F8F9FC" }}>
                      <div className="w-3 h-3 rounded-full" style={{ background: t.brand }} />
                    </div>
                  </div>
                  <span className={`text-[10px] font-semibold leading-none ${isActive ? "text-primary" : "text-textm"}`}>
                    {t.label}
                  </span>
                  {isActive && (
                    <span className="text-[9px] text-primary leading-none">✓ Aktif</span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Font size — Sidebar */}
        <section>
          <h4 className="text-sm font-semibold text-textp mb-2">Ukuran Font Sidebar</h4>
          <div className="flex gap-2">
            {FONT_SIZES.map((f) => (
              <button key={f.key} onClick={() => onSidebarFontSize(f.key)}
                className={`flex-1 h-10 rounded-xl border font-medium transition ${
                  sidebarFontSize === f.key ? "bg-primary text-white border-primary" : "bg-white border-border text-texts hover:bg-hover"
                }`}
                style={{ fontSize: f.px }}>
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-textm mt-1.5">
            Pratinjau: <span style={{ fontSize: FONT_SIZES.find((f) => f.key === sidebarFontSize)?.px }}>Nama group &amp; preview pesan</span>
          </p>
        </section>

        {/* Font size — Chat */}
        <section>
          <h4 className="text-sm font-semibold text-textp mb-2">Ukuran Font Chat</h4>
          <div className="flex gap-2">
            {FONT_SIZES.map((f) => (
              <button key={f.key} onClick={() => onChatFontSize(f.key)}
                className={`flex-1 h-10 rounded-xl border font-medium transition ${
                  chatFontSize === f.key ? "bg-primary text-white border-primary" : "bg-white border-border text-texts hover:bg-hover"
                }`}
                style={{ fontSize: f.px }}>
                {f.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-textm mt-1.5">
            Pratinjau: <span style={{ fontSize: FONT_SIZES.find((f) => f.key === chatFontSize)?.px }}>Teks pesan terlihat seperti ini</span>
          </p>
        </section>

        {/* Chat background color */}
        <section>
          <h4 className="text-sm font-semibold text-textp mb-2">Warna Latar Chat</h4>
          <div className="flex flex-wrap gap-2">
            {CHAT_BG_PRESETS.map((p) => (
              <button key={p.value} onClick={() => { setChatBg(p.value); applyChatBg(p.value); }}
                title={p.label}
                className={`w-9 h-9 rounded-xl border-2 transition ${chatBg === p.value ? "border-primary scale-110 shadow-md" : "border-border hover:border-textm"}`}
                style={{ backgroundColor: p.value }}>
                {chatBg === p.value && (
                  <span className={`text-xs font-bold ${p.value === "#1E2D3D" ? "text-white" : "text-primary"}`}>✓</span>
                )}
              </button>
            ))}
            {/* Custom color */}
            <label title="Kustom" className={`w-9 h-9 rounded-xl border-2 flex items-center justify-center cursor-pointer transition ${!CHAT_BG_PRESETS.some((p) => p.value === chatBg) ? "border-primary scale-110 shadow-md" : "border-border hover:border-textm"}`}
              style={{ background: "linear-gradient(135deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f)" }}>
              <input type="color" className="sr-only" value={chatBg}
                onChange={(e) => { setChatBg(e.target.value); applyChatBg(e.target.value); }} />
            </label>
          </div>
          <div className="mt-2 h-8 rounded-lg border border-border flex items-center px-3" style={{ backgroundColor: chatBg }}>
            <span className="text-xs" style={{ color: chatBg === "#1E2D3D" ? "#fff" : "#1D2B45" }}>Pratinjau latar pesan</span>
          </div>
        </section>

        {/* Push Notifications */}
        {pushSupported && pushPermission !== "denied" && (
          <section>
            <h4 className="text-sm font-semibold text-textp mb-2">{t("profile.notifications")}</h4>
            <div className="flex items-center justify-between bg-white border border-border rounded-xl px-4 py-3">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-textp">
                  {pushSubscribed ? t("profile.notifOn") : t("profile.notifOff")}
                </span>
                <span className="text-xs text-textm mt-0.5">
                  {pushSubscribed
                    ? t("profile.notifOnDesc")
                    : t("profile.notifOffDesc")}
                </span>
              </div>
              <button
                disabled={pushLoading}
                onClick={async () => {
                  setPushLoading(true);
                  try {
                    if (pushSubscribed) {
                      await unsubscribeFromPush();
                      setPushSubscribed(false);
                      toast(t("profile.notifDisabled"), "info");
                    } else {
                      const ok = await subscribeToPush();
                      if (ok) {
                        setPushSubscribed(true);
                        toast(t("profile.notifEnabled"), "success");
                      } else {
                        toast(t("profile.notifDenied"), "error");
                      }
                    }
                  } catch (e: any) {
                    toast(e?.message || t("profile.notifError"), "error");
                  } finally {
                    setPushLoading(false);
                  }
                }}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none disabled:opacity-60 ${
                  pushSubscribed ? "bg-primary" : "bg-gray-300"
                }`}
                role="switch"
                aria-checked={pushSubscribed}>
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200 ${
                    pushSubscribed ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          </section>
        )}

        <button onClick={onLogout}
          className="w-full h-11 rounded-xl border border-danger/30 text-danger font-semibold bg-red-50 hover:bg-red-100 transition">
          {t("profile.logout")}
        </button>

        <button onClick={() => { onClose ? onClose() : setMobileTab("list"); }} className="w-full text-sm text-primary font-medium text-center py-1">
          ← {t("nav.chats")}
        </button>
      </div>
    </div>
  );
}