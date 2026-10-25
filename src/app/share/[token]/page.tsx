import Link from "next/link";
import VideoThumb from "@/components/VideoThumb";
import { createClient } from "@/lib/supabase/server";
import type { SharedFolder } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SharedFolderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const isUuid = /^[0-9a-f-]{36}$/i.test(token);
  const { data } = isUuid ? await supabase.rpc("get_shared_folder", { token }) : { data: null };
  const shared = data as SharedFolder | null;

  if (!shared) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">Folder not found</h1>
        <p className="text-slate-600">This link may have been turned off by its owner.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <p className="text-sm text-slate-500">Shared folder</p>
      <h1 className="mb-6 text-3xl font-bold">{shared.folder.name}</h1>
      <Section shared={shared} folderId={shared.folder.id} depth={0} />
      <p className="mt-12 text-center text-sm text-slate-500">
        <Link href="/" className="underline">
          Make your own learning library
        </Link>
      </p>
    </main>
  );
}

function Section({ shared, folderId, depth }: { shared: SharedFolder; folderId: string; depth: number }) {
  const videos = shared.videos.filter((v) => v.folder_id === folderId);
  const children = shared.folders.filter((f) => f.parent_id === folderId);

  return (
    <div className={depth > 0 ? "mt-8" : ""}>
      {videos.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((v) => (
            <div key={v.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <VideoThumb video={v} />
              <div className="p-3">
                <a href={v.url} target="_blank" rel="noreferrer" className="line-clamp-2 font-medium hover:underline">
                  {v.title}
                </a>
                {v.channel && <p className="text-sm text-slate-500">{v.channel}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {children.map((child) => (
        <div key={child.id} className="mt-8">
          <h2 className="mb-3 text-xl font-semibold">📁 {child.name}</h2>
          <Section shared={shared} folderId={child.id} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}
