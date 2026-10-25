import { redirect } from "next/navigation";
import ReaderPage from "@/components/ReaderPage";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ReadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/");

  return <ReaderPage articleId={id} />;
}
