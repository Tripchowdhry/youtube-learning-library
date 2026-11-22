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

// When set, the dialog has a text box and resolves with what was typed.
type TextField = { value: string; placeholder?: string; allowEmpty?: boolean };
type Request = ConfirmOptions & { field?: TextField; resolve: (ok: boolean, text?: string) => void };

let show: ((request: Request) => void) | null = null;

// A friendlier window.confirm. Needs <ConfirmHost /> on the page (it is in the root layout).
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(window.confirm(`${options.title}\n\n${options.message}`));
    show({ ...options, resolve });
  });
}

// A friendlier window.prompt: resolves with the trimmed text, or null when cancelled.
// Empty text counts as cancelled unless allowEmpty is set (e.g. clearing all tags).
export function askText(
  options: Omit<ConfirmOptions, "message" | "danger"> & { message?: string; value?: string; placeholder?: string; allowEmpty?: boolean },
): Promise<string | null> {
  return new Promise((resolve) => {
    const done = (text: string | null | undefined) => {
      const trimmed = text?.trim() ?? null;
      resolve(trimmed || (options.allowEmpty && trimmed !== null ? "" : null));
    };
    if (!show) return done(window.prompt(options.title, options.value ?? ""));
    show({
      ...options,
      message: options.message ?? "",
      field: { value: options.value ?? "", placeholder: options.placeholder, allowEmpty: options.allowEmpty },
      resolve: (ok, text) => done(ok ? text : null),
    });
  });
}

export function ConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const textBox = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");

  useEffect(() => {
    show = (next) => {
      setText(next.field?.value ?? "");
      setRequest(next);
    };
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (!request) return;
    if (request.field) textBox.current?.select();
    else cancelButton.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function close(ok: boolean) {
    request?.resolve(ok, text);
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
        {request.message && <p className="mt-3 whitespace-pre-line text-sm text-slate-600">{request.message}</p>}
        {request.field && (
          <input
            ref={textBox}
            autoFocus
            value={text}
            placeholder={request.field.placeholder}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (text.trim() || request.field?.allowEmpty)) close(true);
            }}
            className="mt-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-base outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-200"
          />
        )}
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
            disabled={Boolean(request.field) && !request.field?.allowEmpty && !text.trim()}
            className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
              request.danger ? "bg-red-600 hover:bg-red-700" : "bg-slate-900 hover:bg-slate-700"
            } disabled:opacity-40`}
          >
            {request.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
