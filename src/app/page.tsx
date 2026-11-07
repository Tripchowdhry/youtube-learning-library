import Link from "next/link";
import Library from "@/components/Library";
import SignInButton from "@/components/SignInButton";
import { BRAND } from "@/lib/brand";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (!isSupabaseConfigured) return <SetupNotice />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) return <Library userEmail={user.email ?? ""} />;

  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-4 text-center">
      <p className="text-base font-semibold text-slate-700">
        📚 {BRAND.name}: <span className="font-normal text-slate-500">{BRAND.tagline}</span>
      </p>
      <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">{BRAND.headline}</h1>
      <p className="text-lg text-slate-600">{BRAND.description}</p>
      <SignInButton />
      {error && <p className="text-sm text-red-600">Sign-in didn&apos;t work. Please try again.</p>}
      <Link href="/privacy" className="text-sm text-slate-500 underline">
        Privacy policy
      </Link>
    </main>
  );
}

function SetupNotice() {
  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="mb-4 text-2xl font-bold">Almost ready</h1>
      <p className="text-slate-700">
        The app isn&apos;t connected to Supabase yet. Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> as environment variables (see <code>README.md</code>), then
        restart or redeploy.
      </p>
    </main>
  );
}
