import { redirect } from "next/navigation";
import ScrapbookLibrary from "@/components/ScrapbookLibrary";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ScrapbookPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return <ScrapbookLibrary userEmail={user.email ?? ""} />;
}
