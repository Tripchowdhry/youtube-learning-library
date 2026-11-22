import { redirect } from "next/navigation";
import AiUsage from "@/components/AiUsage";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AiUsagePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return <AiUsage />;
}
