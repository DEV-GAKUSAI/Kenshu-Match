"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" paints the confirm button red (cancel / decline actions). */
  tone?: "primary" | "danger";
  /** When set, shows a text box and returns what was typed as `reason`. */
  reasonLabel?: string;
}

export interface ConfirmResult {
  ok: boolean;
  reason: string;
}

type ConfirmFn = (options: ConfirmOptions) => Promise<ConfirmResult>;

const ConfirmContext = createContext<ConfirmFn | undefined>(undefined);

/** In-app replacement for window.confirm() / window.prompt(): same promise-style call, styled like the rest of the site. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [reason, setReason] = useState("");
  const resolverRef = useRef<((result: ConfirmResult) => void) | null>(null);
  const reasonRef = useRef("");

  const confirm = useCallback<ConfirmFn>((opts) => {
    return new Promise<ConfirmResult>((resolve) => {
      resolverRef.current = resolve;
      reasonRef.current = "";
      setReason("");
      setOptions(opts);
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    resolverRef.current?.({ ok, reason: ok ? reasonRef.current.trim() : "" });
    resolverRef.current = null;
    setOptions(null);
  }, []);

  useEffect(() => {
    if (!options) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {options ? (
        <div
          className="modal-overlay is-open"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) close(false);
          }}
        >
          <div className="modal-box confirm-box" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 className="modal-title" id="confirm-title">{options.title}</h2>
            {options.message ? <p className="modal-desc confirm-box__message">{options.message}</p> : null}
            {options.reasonLabel ? (
              <div className="form-field confirm-box__reason">
                <label htmlFor="confirm-reason">{options.reasonLabel}</label>
                <textarea
                  id="confirm-reason"
                  rows={3}
                  value={reason}
                  onChange={(event) => {
                    reasonRef.current = event.target.value;
                    setReason(event.target.value);
                  }}
                />
              </div>
            ) : null}
            <div className="confirm-box__actions">
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => close(false)}>
                {options.cancelLabel || "戻る"}
              </button>
              <button
                type="button"
                className={`btn btn--sm ${options.tone === "danger" ? "btn--danger-solid" : "btn--primary"}`}
                onClick={() => close(true)}
              >
                {options.confirmLabel || "はい"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (context === undefined) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context;
}
