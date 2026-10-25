import { createClient } from "@/lib/supabase/server";

// The Reading section's link lookups are only for signed-in people.
export async function isSignedIn() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return Boolean(user);
}
