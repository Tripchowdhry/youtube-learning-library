import { redirect } from "next/navigation";
import ReadingLibrary from "@/components/ReadingLibrary";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ReadingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return <ReadingLibrary userEmail={user.email ?? ""} kind="reading" />;
}
