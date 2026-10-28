"use client";

import { useEffect, useRef, useState } from "react";

export type ConfirmOptions = {
  title: string;
  message: string;
  // Shown in a grey box, e.g. the note or video being removed.
  quote?: string;
  confirmLabel: string;
  cancelLabel?: string;
  // Red button for things that can't be undone.
  danger?: boolean;
};

type Request = ConfirmOptions & { resolve: (ok: boolean) => void };

let show: ((request: Request) => void) | null = null;

// A friendlier window.confirm. Needs <ConfirmHost /> on the page (it is in the root layout).
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(window.confirm(`${options.title}\n\n${options.message}`));
    show({ ...options, resolve });
  });
}

export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = (next) => setRequest(next);
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    cancelButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function close(ok: boolean) {
    request?.resolve(ok);
    setRequest(null);
  }

  if (!request) return null;
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) close(false);
      }}
    >
      <div role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h2 id="confirm-title" className={`text-lg font-semibold ${request.danger ? "text-red-700" : "text-slate-900"}`}>
          {request.title}
        </h2>
        {request.quote && (
          <p className="mt-3 line-clamp-3 rounded-lg bg-slate-100 px-3 py-2 text-sm italic text-slate-700">{request.quote}</p>
        )}
        <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{request.message}</p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelButton}
            onClick={() => close(false)}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {request.cancelLabel ?? "Cancel"}
          </button>
          <button
            onClick={() => close(true)}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              request.danger ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-700"
            }`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
