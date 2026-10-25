import { redirect } from "next/navigation";
import ClipsManager from "@/components/ClipsManager";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ClipsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return <ClipsManager />;
}
