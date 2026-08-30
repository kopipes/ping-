import React, { createContext, useContext, useState, useCallback, useRef } from "react";

// ── Types ─────────────────────────────────────────────────────────────────────

type ToastType = "error" | "success" | "info" | "warning";

interface ToastItem {
  id: number;
  type: ToastType;
  message: string;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface PromptOptions {
  title?: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
}

interface ModalContextValue {
  toast: (message: string, type?: ToastType) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  prompt: (options: PromptOptions) => Promise<string | null>;
}

// ── Context ───────────────────────────────────────────────────────────────────

const ModalContext = createContext<ModalContextValue | null>(null);

export function useModal() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModal must be used within ModalProvider");
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────────────────────

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [promptState, setPromptState] = useState<(PromptOptions & { resolve: (v: string | null) => void }) | null>(null);
  const [promptValue, setPromptValue] = useState("");
  const idRef = useRef(0);

  const toast = useCallback((message: string, type: ToastType = "error") => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, type, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const prompt = useCallback((options: PromptOptions): Promise<string | null> => {
    setPromptValue(options.defaultValue || "");
    return new Promise((resolve) => {
      setPromptState({ ...options, resolve });
    });
  }, []);

  const resolveConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  const resolvePrompt = (value: string | null) => {
    promptState?.resolve(value);
    setPromptState(null);
    setPromptValue("");
  };

  const toastColors: Record<ToastType, string> = {
    error:   "bg-danger text-white",
    success: "bg-success text-white",
    warning: "bg-warning text-white",
    info:    "bg-primary text-white",
  };

  const toastIcons: Record<ToastType, string> = {
    error: "✕", success: "✓", warning: "⚠", info: "ℹ",
  };

  return (
    <ModalContext.Provider value={{ toast, confirm, prompt }}>
      {children}

      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id}
            className={`flex items-start gap-3 px-4 py-3 rounded-xl shadow-lg fade-slide-up pointer-events-auto ${toastColors[t.type]}`}>
            <span className="shrink-0 font-bold text-sm mt-0.5">{toastIcons[t.type]}</span>
            <p className="text-sm leading-snug flex-1">{t.message}</p>
            <button onClick={() => setToasts((ts) => ts.filter((x) => x.id !== t.id))}
              className="shrink-0 opacity-70 hover:opacity-100 text-lg leading-none">×</button>
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => resolveConfirm(false)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 fade-slide-up" onClick={(e) => e.stopPropagation()}>
            {confirmState.title && (
              <h3 className={`font-bold text-lg mb-2 ${confirmState.danger ? "text-danger" : "text-textp"}`}>
                {confirmState.title}
              </h3>
            )}
            <p className="text-sm text-texts leading-relaxed mb-5">{confirmState.message}</p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => resolveConfirm(false)}
                className="px-4 h-9 rounded-lg border border-border text-sm text-textm hover:bg-hover transition">
                {confirmState.cancelLabel || "Batal"}
              </button>
              <button onClick={() => resolveConfirm(true)}
                className={`px-4 h-9 rounded-lg text-sm font-semibold text-white transition ${
                  confirmState.danger ? "bg-danger hover:bg-danger/80" : "bg-primary hover:bg-primaryhover"
                }`}>
                {confirmState.confirmLabel || "OK"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Prompt dialog */}
      {promptState && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => resolvePrompt(null)}>
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 fade-slide-up" onClick={(e) => e.stopPropagation()}>
            {promptState.title && <h3 className="font-bold text-lg mb-2 text-textp">{promptState.title}</h3>}
            {promptState.message && <p className="text-sm text-texts mb-3">{promptState.message}</p>}
            <input
              className="input-base mb-4"
              value={promptValue}
              onChange={(e) => setPromptValue(e.target.value)}
              placeholder={promptState.placeholder || ""}
              onKeyDown={(e) => {
                if (e.key === "Enter") resolvePrompt(promptValue);
                if (e.key === "Escape") resolvePrompt(null);
              }}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => resolvePrompt(null)}
                className="px-4 h-9 rounded-lg border border-border text-sm text-textm hover:bg-hover transition">
                Batal
              </button>
              <button onClick={() => resolvePrompt(promptValue)}
                className="px-4 h-9 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primaryhover transition">
                {promptState.confirmLabel || "OK"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ModalContext.Provider>
  );
}
