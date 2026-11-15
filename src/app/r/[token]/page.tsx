import type { Metadata } from "next";
import DeadEnd from "@/components/DeadEnd";
import Link from "next/link";
import { ArrowLeft, Eye } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import { Ico } from "@/components/Icon";
import SharedReportDownload from "@/components/SharedReportDownload";
import { parseReport, pictureUrl, type Block, type Inline, type SharedReport } from "@/lib/report";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// A report shared as a read-only link. Anyone with the link can read it, without signing in.
// Only the report's title and text come back (supabase/report-share.sql); nothing else is shared.

async function load(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return { supabase: null, report: null };
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_shared_report", { token });
  return { supabase, report: (data as SharedReport | null) ?? null };
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { report } = await load((await params).token);
  return { title: report ? `${report.title} · BrainShelf` : "Report not found · BrainShelf", robots: { index: false } };
}

export default async function SharedReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const { token } = await params;
  const preview = (await searchParams).preview;
  const { supabase, report } = await load(token);

  if (!report || !supabase) {
    return <DeadEnd title="This report isn't shared any more" text="Its owner may have turned sharing off, or the link may be incomplete." />;
  }

  // The title is shown above, so a first heading that repeats it is left out.
  const blocks = parseReport(report.body);
  const first = blocks[0];
  if (first?.type === "h1" && first.inline.map((p) => p.text).join("").trim() === report.title.trim()) blocks.shift();
  const resolve = (src: string) => pictureUrl(supabase, src);
  const updated = new Date(report.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <main className="mx-auto max-w-3xl px-4 py-6">
      {preview && /^[0-9a-f-]{36}$/i.test(preview) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <span className="flex items-center gap-1.5 font-semibold">
            <Ico icon={Eye} tone="blue" size={16} />
            Preview: what people with the link see
          </span>
          <Link href={`/report/${preview}`} className="ml-auto flex items-center gap-1 font-medium underline">
            <ArrowLeft size={14} aria-hidden />
            Back to the report
          </Link>
        </div>
      )}
      <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200">
        <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-[#2b3b5e]">
            <BrandLogo size={22} /> BrainShelf
          </Link>
          <span className="hidden text-sm whitespace-nowrap text-slate-500 sm:inline">· Shared report</span>
          <SharedReportDownload title={report.title} body={report.body} />
        </header>
        {/* The BrainShelf logo's book colours */}
        <span aria-hidden className="flex h-1">
          <span className="flex-1 bg-[#dc2626]" />
          <span className="flex-1 bg-[#16a34a]" />
          <span className="flex-1 bg-[#2563eb]" />
          <span className="flex-1 bg-[#f59e0b]" />
        </span>
        <article className="px-5 py-6 sm:px-8">
          <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{report.title}</h1>
          <p className="mt-1 mb-6 text-sm text-slate-500">Updated {updated}</p>
          <div className="report-editor text-slate-800">
            <Blocks blocks={blocks} resolve={resolve} />
          </div>
        </article>
        <p className="border-t border-slate-100 px-4 py-4 text-center text-sm text-slate-500">
          Made with BrainShelf Report Writer ·{" "}
          <Link href="/" className="underline">
            Make your own learning library
          </Link>
        </p>
      </div>
    </main>
  );
}

// The report drawn as ordinary page elements (never as raw HTML), with lists grouped together.
function Blocks({ blocks, resolve }: { blocks: Block[]; resolve: (src: string) => string }) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.type === "li" || b.type === "ol") {
      const items: Block[] = [];
      while (i < blocks.length && blocks[i].type === b.type) items.push(blocks[i++]);
      i--;
      const lis = items.map((it, j) => <li key={j}>{"inline" in it && <Text parts={it.inline} />}</li>);
      out.push(
        b.type === "ol" ? (
          <ol key={i} start={Number(b.num) || 1}>
            {lis}
          </ol>
        ) : (
          <ul key={i}>{lis}</ul>
        ),
      );
    } else if (b.type === "img") {
      out.push(
        <figure key={i}>
          <img src={resolve(b.src)} alt={b.caption || "Picture from the notes"} />
          {b.caption && <figcaption>{b.caption}</figcaption>}
        </figure>,
      );
    } else if (b.type === "quote") {
      out.push(
        <blockquote key={i}>
          <Text parts={b.inline} />
        </blockquote>,
      );
    } else {
      const Tag = b.type;
      out.push(
        <Tag key={i}>
          <Text parts={b.inline} />
        </Tag>,
      );
    }
  }
  return <>{out}</>;
}

function Text({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        let node: React.ReactNode = p.text;
        if (p.bold) node = <strong>{node}</strong>;
        if (p.italic) node = <em>{node}</em>;
        if (p.underline) node = <u>{node}</u>;
        if (p.href && /^https?:\/\//.test(p.href))
          node = (
            <a href={p.href} target="_blank" rel="noreferrer nofollow">
              {node}
            </a>
          );
        return <span key={i}>{node}</span>;
      })}
    </>
  );
}
