import { useState, useEffect, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/auth";
import { api } from "../lib/api";

export function Login() {
  const { t } = useTranslation();
  const login = useAuthStore((s) => s.login);
  const loading = useAuthStore((s) => s.loading);
  const error = useAuthStore((s) => s.error);
  const [mode, setMode] = useState<"login" | "register">("login");

  // Login form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Register form
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");
  const [regDivision, setRegDivision] = useState("");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [regSuccess, setRegSuccess] = useState(false);
  const [divisions, setDivisions] = useState<string[]>([]);

  // Fetch division master data when register tab is active
  useEffect(() => {
    if (mode === "register" && divisions.length === 0) {
      api<{ divisions: string[] }>("/api/users/divisions")
        .then((res) => setDivisions(res.divisions || []))
        .catch(() => {});
    }
  }, [mode]);

  const onLogin = async (e: FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  const onRegister = async (e: FormEvent) => {
    e.preventDefault();
    if (!regName || !regEmail || !regPassword) { setRegError("Semua field wajib diisi"); return; }
    if (regPassword.length < 6) { setRegError("Password minimal 6 karakter"); return; }
    if (regPassword !== regConfirm) { setRegError("Password tidak sama"); return; }
    setRegLoading(true); setRegError("");
    try {
      await api("/api/auth/register", {
        method: "POST",
        body: { name: regName, email: regEmail, password: regPassword, division: regDivision || undefined },
      });
      setRegSuccess(true);
    } catch (e: any) {
      setRegError(e?.message || "Pendaftaran gagal");
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center bg-sb">
      <div className="w-full max-w-sm mx-auto px-6 fade-slide-up">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-16 h-16 rounded-2xl bg-white/10 items-center justify-center text-white text-2xl font-black mb-4">
            Pi
          </div>
          <h1 className="text-white text-2xl font-bold">{t("login.welcome")}</h1>
          <p className="text-sb-text mt-1 text-sm">Ping! — Internal Company Chat</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {/* Mode toggle */}
          <div className="flex gap-1 p-1 bg-hover rounded-xl mb-5">
            <button onClick={() => setMode("login")}
              className={`flex-1 h-9 rounded-lg text-sm font-semibold transition ${mode === "login" ? "bg-white shadow-sm text-textp" : "text-textm"}`}>
              Masuk
            </button>
            <button onClick={() => setMode("register")}
              className={`flex-1 h-9 rounded-lg text-sm font-semibold transition ${mode === "register" ? "bg-white shadow-sm text-textp" : "text-textm"}`}>
              Daftar
            </button>
          </div>

          {mode === "login" ? (
            <form onSubmit={onLogin} className="flex flex-col gap-4">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-textp">{t("login.email")}</span>
                <input type="email" required placeholder="nama@perusahaan.com" className="input-base"
                  value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" autoFocus />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-textp">{t("login.password")}</span>
                <input type="password" required placeholder="Kata sandi" className="input-base"
                  value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </label>
              {error && (
                <div className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{error}</div>
              )}
              <button type="submit" disabled={loading}
                className="w-full h-11 rounded-lg bg-primary text-white font-bold text-[15px] hover:bg-primaryhover disabled:opacity-60 transition mt-1">
                {loading ? t("common.loading") : t("login.submit")}
              </button>
            </form>
          ) : regSuccess ? (
            <div className="text-center space-y-4">
              <div className="text-4xl">✅</div>
              <h3 className="font-bold text-textp">Pendaftaran Berhasil!</h3>
              <p className="text-sm text-textm">Akun Anda sedang menunggu persetujuan dari admin. Anda akan bisa login setelah akun diaktifkan.</p>
              <button onClick={() => { setMode("login"); setRegSuccess(false); }}
                className="w-full h-10 rounded-lg bg-primary text-white font-semibold text-sm hover:bg-primaryhover">
                Kembali ke Login
              </button>
            </div>
          ) : (
            <form onSubmit={onRegister} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-textp">Nama Lengkap</span>
                <input type="text" required placeholder="Nama Anda" className="input-base"
                  value={regName} onChange={(e) => setRegName(e.target.value)} autoFocus />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-textp">Email</span>
                <input type="email" required placeholder="email@perusahaan.com" className="input-base"
                  value={regEmail} onChange={(e) => setRegEmail(e.target.value)} />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-textp">Divisi <span className="font-normal text-textm">(opsional)</span></span>
                {divisions.length > 0 ? (
                  <select
                    className="input-base"
                    value={regDivision}
                    onChange={(e) => setRegDivision(e.target.value)}
                  >
                    <option value="">Pilih divisi…</option>
                    {divisions.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                ) : (
                  <input type="text" placeholder="Marketing, IT, Finance…" className="input-base"
                    value={regDivision} onChange={(e) => setRegDivision(e.target.value)} />
                )}
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-textp">Password</span>
                <input type="password" required placeholder="Min. 6 karakter" className="input-base"
                  value={regPassword} onChange={(e) => setRegPassword(e.target.value)} autoComplete="new-password" />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-semibold text-textp">Konfirmasi Password</span>
                <input type="password" required placeholder="Ulangi password" className="input-base"
                  value={regConfirm} onChange={(e) => setRegConfirm(e.target.value)} autoComplete="new-password" />
              </label>
              {regError && (
                <div className="text-sm text-danger bg-danger/5 border border-danger/20 rounded-lg px-3 py-2">{regError}</div>
              )}
              <p className="text-xs text-textm bg-warning/5 border border-warning/20 rounded-lg px-3 py-2">
                Akun akan aktif setelah disetujui admin.
              </p>
              <button type="submit" disabled={regLoading}
                className="w-full h-11 rounded-lg bg-primary text-white font-bold text-[15px] hover:bg-primaryhover disabled:opacity-60 transition">
                {regLoading ? "Mendaftar…" : "Daftar Sekarang"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}