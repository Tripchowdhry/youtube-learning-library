import { redirect } from "next/navigation";
import VaultLibrary from "@/components/VaultLibrary";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function VaultPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return <VaultLibrary userEmail={user.email ?? ""} />;
}
