"use client";

import React, { createContext, useContext, useState, useCallback } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";

type ToastType = "success" | "danger";

export type ToastAction = { label: string; onClick: () => void };
export type ToastOptions = { action?: ToastAction; duration?: number };

type Toast = {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
};

type ToastContextType = {
  toast: (message: string, type?: ToastType, options?: ToastOptions) => void;
  /** Success toast with an Undo action (F0.3). Stays 8s so it is reachable. */
  undoable: (message: string, onUndo: () => void) => void;
  success: (message: string) => void;
  error: (message: string) => void;
};

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "success", options?: ToastOptions) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, action: options?.action }]);

    setTimeout(() => {
      removeToast(id);
    }, options?.duration ?? (options?.action ? 8000 : 4000));
  }, [removeToast]);

  const undoable = useCallback((message: string, onUndo: () => void) => {
    toast(message, "success", { action: { label: "Undo", onClick: onUndo } });
  }, [toast]);

  const success = useCallback((message: string) => {
    toast(message, "success");
  }, [toast]);

  const error = useCallback((message: string) => {
    toast(message, "danger");
  }, [toast]);

  const contextValue = React.useMemo(
    () => ({ toast, success, error, undoable }),
    [toast, success, error, undoable]
  );

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      
      {/* Toast Render Container: Fixed at bottom-right by default.
          z-[9999] -- must outrank every modal/drawer backdrop (HeroUI's
          default is z-50, and some overlays already bump themselves to
          z-[100] to stack above each other), or a toast fired while a
          modal/drawer is open renders invisibly behind it. */}
      <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[9999] flex flex-col gap-3 max-w-sm w-full pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 rounded-xl border bg-background/95 backdrop-blur-md p-4 shadow-xl animate-in fade-in slide-in-from-bottom-5 duration-300 ${
              t.type === "success" 
                ? "border-success/20 text-success" 
                : "border-danger/20 text-danger"
            }`}
          >
            <div className="flex items-center gap-3">
              {t.type === "success" ? (
                <CheckCircle2 className="h-5 w-5 shrink-0" />
              ) : (
                <AlertCircle className="h-5 w-5 shrink-0" />
              )}
              <span className="text-sm font-medium text-foreground">{t.message}</span>
            </div>
            {t.action ? (
              <button
                type="button"
                className="sh-btn sh-btn--ghost sh-btn--sm"
                onClick={() => {
                  t.action?.onClick();
                  removeToast(t.id);
                }}
              >
                {t.action.label}
              </button>
            ) : null}
            <button
              onClick={() => removeToast(t.id)}
              className="text-muted hover:text-foreground p-1 rounded-md hover:bg-surface-tertiary transition-colors"
              aria-label="Dismiss toast"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
