"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SignInButton() {
  const [busy, setBusy] = useState(false);

  async function signIn() {
    setBusy(true);
    await createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <button
      onClick={signIn}
      disabled={busy}
      className="rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white shadow hover:bg-slate-700 disabled:opacity-60"
    >
      {busy ? "Opening Google…" : "Continue with Google"}
    </button>
  );
}
