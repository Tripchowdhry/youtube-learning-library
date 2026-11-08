import Landing from "@/components/Landing";
import Library from "@/components/Library";
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
  return <Landing error={error} />;
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
