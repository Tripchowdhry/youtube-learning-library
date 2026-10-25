import { redirect } from "next/navigation";
import StudyPage from "@/components/StudyPage";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function VideoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return <StudyPage videoId={id} />;
}
