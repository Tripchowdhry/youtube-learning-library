import { redirect } from "next/navigation";
import ReportsList from "@/components/ReportsList";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return <ReportsList userEmail={user.email ?? ""} />;
}
