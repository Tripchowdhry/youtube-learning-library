import Link from "next/link";
import VideoThumb from "@/components/VideoThumb";
import { createClient } from "@/lib/supabase/server";
import type { SharedCategory, SharedFolder } from "@/lib/types";
import { ArrowLeft, ExternalLink, Eye, FileText, Folder as FolderIcon, Tag } from "lucide-react";
import { Ico } from "@/components/Icon";

export const dynamic = "force-dynamic";

export default async function SharedFolderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { token } = await params;
  const preview = (await searchParams).preview === "1";
  const supabase = await createClient();
  const isUuid = /^[0-9a-f-]{36}$/i.test(token);
  const { data } = isUuid ? await supabase.rpc("get_shared_folder", { token }) : { data: null };
  const shared = data as SharedFolder | null;
  // Not a Videos folder: it may be a shared Reading, Tutorials or ScrapBook category.
  const sharedCategory =
    !shared && isUuid ? ((await supabase.rpc("get_shared_category", { token })).data as SharedCategory | null) : null;

  if (sharedCategory) return <SharedCategoryPage shared={sharedCategory} preview={preview} />;

  if (!shared) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="mb-2 text-2xl font-bold">Category not found</h1>
        <p className="text-slate-600">This link may have been turned off by its owner.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      {preview && (
        <PreviewBanner text="Your notes and summaries stay private. Only the videos below are shared." back="/" />
      )}
      <p className="text-sm text-slate-500">Shared category</p>
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
          <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
            <Ico icon={FolderIcon} tone="amber" size={20} />
            {child.name}
          </h2>
          <Section shared={shared} folderId={child.id} depth={depth + 1} />
        </div>
      ))}
    </div>
  );
}

function PreviewBanner({ text, back }: { text: string; back: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
      <span className="flex items-center gap-1.5 font-semibold">
        <Ico icon={Eye} tone="violet" size={16} />
        Preview: what people with the link see
      </span>
      <span className="text-violet-800">{text}</span>
      <Link href={back} className="ml-auto flex items-center gap-1 font-medium underline">
        <ArrowLeft size={14} aria-hidden />
        Back to my library
      </Link>
    </div>
  );
}

// A ScrapBook page's typed text, without its formatting, keeping line breaks. Shown as plain text, never as HTML.
function pageText(html: string) {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6])[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const CATEGORY_KINDS = {
  reading: { label: "Shared reading list", back: "/reading", what: "links" },
  tutorial: { label: "Shared tutorials", back: "/tutorials", what: "links" },
  scrap: { label: "Shared ScrapBook pages", back: "/scrapbook", what: "pages" },
} as const;

function SharedCategoryPage({ shared, preview }: { shared: SharedCategory; preview: boolean }) {
  const kind = CATEGORY_KINDS[shared.category.kind] ?? CATEGORY_KINDS.reading;
  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      {preview && (
        <PreviewBanner
          text={
            kind.what === "pages"
              ? "Only the titles and typed text of the pages below are shared. Handwriting stays private."
              : "Your notes and summaries stay private. Only the links below are shared."
          }
          back={kind.back}
        />
      )}
      <p className="text-sm text-slate-500">{kind.label}</p>
      <h1 className="mb-6 text-3xl font-bold">{shared.category.name}</h1>
      <CategorySection shared={shared} categoryId={shared.category.id} />
      <p className="mt-12 text-center text-sm text-slate-500">
        <Link href="/" className="underline">
          Make your own learning library
        </Link>
      </p>
    </main>
  );
}

function CategorySection({ shared, categoryId }: { shared: SharedCategory; categoryId: string }) {
  const articles = shared.articles.filter((a) => a.category_id === categoryId);
  const scraps = shared.scraps.filter((s) => s.category_id === categoryId);
  const children = shared.categories.filter((c) => c.parent_id === categoryId);
  return (
    <div>
      {articles.length > 0 && (
        <ul className="flex flex-col gap-2">
          {articles.map((a) => (
            <li key={a.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <a href={a.url} target="_blank" rel="noreferrer" className="flex items-start gap-2 font-medium hover:underline">
                <Ico icon={ExternalLink} tone="sky" size={16} className="mt-1 shrink-0" />
                <span className="line-clamp-2">{a.title || a.url}</span>
              </a>
              {(a.site || a.author) && (
                <p className="mt-0.5 pl-6 text-sm text-slate-500">{[a.site, a.author].filter(Boolean).join(" · ")}</p>
              )}
            </li>
          ))}
        </ul>
      )}
      {scraps.length > 0 && (
        <div className="flex flex-col gap-4">
          {scraps.map((s) => {
            const text = pageText(s.body);
            return (
              <article key={s.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Ico icon={FileText} tone="sky" size={18} />
                  {s.title}
                </h3>
                {text && <p className="mt-2 whitespace-pre-wrap text-slate-700">{text}</p>}
              </article>
            );
          })}
        </div>
      )}
      {children.map((child) => (
        <div key={child.id} className="mt-8">
          <h2 className="mb-3 flex items-center gap-2 text-xl font-semibold">
            <Ico icon={Tag} tone="orange" size={20} />
            {child.name}
          </h2>
          <CategorySection shared={shared} categoryId={child.id} />
        </div>
      ))}
    </div>
  );
}
