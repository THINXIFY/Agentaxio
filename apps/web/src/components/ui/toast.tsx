"use client";

import * as React from "react";
import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";

type ToastTone = "success" | "info" | "warning";

interface ToastInput {
  title: string;
  description?: string;
  tone?: ToastTone;
}

interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = React.createContext<((toast: ToastInput) => void) | null>(null);

const TONE_ICON = { success: CheckCircle2, info: Info, warning: TriangleAlert } as const;
const TONE_CLASS = {
  success: "text-success-text",
  info: "text-info-text",
  warning: "text-warning-text",
} as const;

const DURATION_MS = 5000;

/**
 * Lightweight notifications. Announced politely to screen readers (role="status"), dismissible, auto-dismiss after 5 s.
 * Used for confirmations of real UI actions (e.g. copying a sample value), never for security decisions.
 */
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<ToastItem[]>([]);
  const nextId = React.useRef(1);

  const dismiss = React.useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = React.useCallback(
    (toast: ToastInput) => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-2), { ...toast, id }]);
      window.setTimeout(() => dismiss(id), DURATION_MS);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed right-4 bottom-4 z-(--z-toast) flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {items.map((t) => {
          const tone = t.tone ?? "success";
          const Icon = TONE_ICON[tone];
          return (
            <div
              key={t.id}
              className="ax-pop pointer-events-auto flex items-start gap-3 rounded-card border border-border bg-surface-raised p-3.5 shadow-floating"
            >
              <Icon className={cn("mt-0.5 size-4 shrink-0", TONE_CLASS[tone])} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{t.title}</p>
                {t.description ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.description}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Dismiss notification"
                className="-m-1 inline-flex size-7 items-center justify-center rounded-control text-muted-foreground hover:bg-surface-hover hover:text-foreground"
              >
                <X className="size-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): (toast: ToastInput) => void {
  const ctx = React.useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
