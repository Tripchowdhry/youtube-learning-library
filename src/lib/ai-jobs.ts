"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// AI requests that keep running when the person moves to another tab of the app.
// They live outside the page components, so leaving a page doesn't stop them.

export type AiJob = { key: string; label: string; startedAt: number };
type Snapshot = { running: AiJob[]; errors: Map<string, string>; finished: { label: string; at: number } | null };
// A page that is open when its job finishes can take the result; return true if it did.
type Taker = (key: string, result: unknown) => boolean;

let snapshot: Snapshot = { running: [], errors: new Map(), finished: null };
const listeners = new Set<() => void>();
const takers = new Set<Taker>();

function update(changes: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...changes };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const empty: Snapshot = { running: [], errors: new Map(), finished: null };

export function useAiJobs() {
  return useSyncExternalStore(subscribe, () => snapshot, () => empty);
}

// Seconds since a job started, ticking once a second, for the "working… 1:23" timers.
export function useSecondsSince(startedAt: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return Math.max(0, Math.floor((now - startedAt) / 1000));
}

export function isAiJobRunning(key: string) {
  return snapshot.running.some((j) => j.key === key);
}

export function clearAiError(key: string) {
  if (!snapshot.errors.has(key)) return;
  const errors = new Map(snapshot.errors);
  errors.delete(key);
  update({ errors });
}

export function onAiJobDone(taker: Taker) {
  takers.add(taker);
  return () => {
    takers.delete(taker);
  };
}

// Runs `work`. Its result goes to an open page that takes it, otherwise to `fallback`
// (which saves it straight to the database). An error stays until the next try.
export async function runAiJob<T>(options: {
  key: string;
  label: string;
  work: () => Promise<{ result?: T; error?: string }>;
  fallback?: (result: T) => Promise<void>;
}) {
  const { key, label } = options;
  if (isAiJobRunning(key)) return;
  clearAiError(key);
  update({ running: [...snapshot.running, { key, label, startedAt: Date.now() }] });
  let error: string | undefined;
  try {
    const outcome = await options.work();
    error = outcome.error;
    if (!error && outcome.result !== undefined) {
      const taken = Array.from(takers).some((take) => take(key, outcome.result));
      if (!taken) {
        await options.fallback?.(outcome.result);
        update({ finished: { label, at: Date.now() } });
      }
    }
  } catch {
    error = "Something went wrong saving the AI's answer. Try again.";
  }
  update({
    running: snapshot.running.filter((j) => j.key !== key),
    errors: error ? new Map(snapshot.errors).set(key, error) : snapshot.errors,
  });
}
