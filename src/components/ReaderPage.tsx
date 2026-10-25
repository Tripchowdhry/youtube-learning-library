"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReadCheck, formatDate } from "@/components/ReadingLibrary";
import { createClient } from "@/lib/supabase/client";
import type { Article, ArticleContent } from "@/lib/types";

// How long the end of the article must stay on screen before it counts as read.
const END_SEEN_MS = 1500;

type TwitterWidgets = {
  widgets: { createTweet: (id: string, el: HTMLElement, options?: object) => Promise<HTMLElement | undefined> };
};

// Loads X's embed script once; it draws a post the same way it looks on X.
let twitterScript: Promise<TwitterWidgets> | null = null;
function loadTwitter(): Promise<TwitterWidgets> {
  const w = window as unknown as { twttr?: TwitterWidgets };
  if (w.twttr?.widgets) return Promise.resolve(w.twttr);
  twitterScript ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://platform.twitter.com/widgets.js";
    script.async = true;
    script.onload = () => (w.twttr?.widgets ? resolve(w.twttr) : reject(new Error("X embed didn't load")));
    script.onerror = () => {
      twitterScript = null;
      reject(new Error("X embed didn't load"));
    };
    document.head.appendChild(script);
  });
  return twitterScript;
}

export default function ReaderPage({ articleId }: { articleId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [article, setArticle] = useState<Article | null>(null);
  const [missing, setMissing] = useState(false);
  const [content, setContent] = useState<ArticleContent | null>(null);
  // True once the post or text is on screen, so the end marker only counts after that.
  const [ready, setReady] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const tweetRef = useRef<HTMLDivElement>(null);
  const autoMarked = useRef(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("articles").select("*").eq("id", articleId).maybeSingle();
      if (!data) return setMissing(true);
      setArticle(data as Article);
      // Already-read articles shouldn't be re-marked after someone unticks them here.
      if (data.read_at) autoMarked.current = true;
      try {
        const res = await fetch(`/api/article-text?url=${encodeURIComponent(data.url)}`);
        setContent(res.ok ? ((await res.json()) as ArticleContent) : { kind: "none" });
      } catch {
        setContent({ kind: "none" });
      }
    })();
  }, [supabase, articleId]);

  // Draw the X post, falling back to "open the original" if X won't show it.
  useEffect(() => {
    if (content?.kind !== "x" || !tweetRef.current) return;
    const el = tweetRef.current;
    let cancelled = false;
    loadTwitter()
      .then((twttr) => twttr.widgets.createTweet(content.postId, el, { dnt: true, conversation: "none" }))
      .then((tweet) => {
        if (cancelled) return;
        if (tweet) setReady(true);
        else setContent({ kind: "none" });
      })
      .catch(() => !cancelled && setContent({ kind: "none" }));
    return () => {
      cancelled = true;
      el.innerHTML = "";
    };
  }, [content]);

  useEffect(() => {
    if (content?.kind === "text") setReady(true);
  }, [content]);

  const setRead = useCallback(
    async (read: boolean) => {
      if (!article) return;
      const read_at = read ? new Date().toISOString() : null;
      setArticle({ ...article, read_at });
      const { error } = await supabase.from("articles").update({ read_at }).eq("id", article.id);
      if (error) setToast(error.message);
    },
    [article, supabase],
  );

  // Reaching the end marks the article as read (once per visit).
  useEffect(() => {
    const end = endRef.current;
    if (!ready || !end || !article || autoMarked.current) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new IntersectionObserver(([entry]) => {
      clearTimeout(timer);
      if (!entry.isIntersecting) return;
      timer = setTimeout(() => {
        if (autoMarked.current) return;
        autoMarked.current = true;
        setRead(true);
        setToast("✓ Marked as read");
        setTimeout(() => setToast(null), 2500);
      }, END_SEEN_MS);
    });
    observer.observe(end);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [ready, article, setRead]);

  if (missing) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="mb-4 text-slate-600">This article isn&apos;t in your reading list.</p>
        <Link href="/reading" className="text-blue-600 underline">
          ← Back to Reading
        </Link>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <Link href="/reading" className="shrink-0 rounded-md px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
          ← Reading
        </Link>
        <span className="min-w-0 flex-1 truncate font-medium">{article?.title}</span>
        {article && (
          <>
            <a
              href={article.url}
              target="_blank"
              rel="noreferrer"
              className="hidden shrink-0 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-100 sm:block"
            >
              Original ↗
            </a>
            <ReadCheck read={Boolean(article.read_at)} onClick={() => setRead(!article.read_at)} />
          </>
        )}
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6">
        {article && (
          <div className="mb-6">
            <h1 className="mb-1 text-2xl font-bold">{article.title}</h1>
            <p className="text-sm text-slate-500">
              {[article.site, article.author].filter(Boolean).join(" · ")} · Added {formatDate(article.created_at)}
              {article.read_at && <span className="text-green-700"> · Read {formatDate(article.read_at)}</span>}
            </p>
          </div>
        )}

        {!content ? (
          <p className="text-slate-500">Loading…</p>
        ) : content.kind === "x" ? (
          <div ref={tweetRef} className="flex min-h-40 justify-center" />
        ) : content.kind === "text" ? (
          <article className="flex flex-col gap-4 text-[17px] leading-relaxed text-slate-800">
            {content.blocks.map((block, i) =>
              block.type === "h" ? (
                <h2 key={i} className="mt-2 text-xl font-semibold text-slate-900">
                  {block.text}
                </h2>
              ) : block.type === "quote" ? (
                <blockquote key={i} className="border-l-4 border-slate-300 pl-4 text-slate-600 italic">
                  {block.text}
                </blockquote>
              ) : block.type === "li" ? (
                <p key={i} className="pl-5 -indent-4">
                  • {block.text}
                </p>
              ) : (
                <p key={i}>{block.text}</p>
              ),
            )}
          </article>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
            <p className="mb-4 text-slate-600">
              This site doesn&apos;t let the app show its text here. Read it on the site, then tap the ✓ when you&apos;re done.
            </p>
            {article && (
              <div className="flex flex-wrap justify-center gap-2">
                <a
                  href={article.url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-md bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
                >
                  Open original ↗
                </a>
                {!article.read_at && (
                  <button
                    onClick={() => setRead(true)}
                    className="rounded-md border border-green-600 px-4 py-2 font-semibold text-green-700 hover:bg-green-50"
                  >
                    ✓ Mark as read
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {ready && (
          <div ref={endRef} className="mt-10 border-t border-slate-200 pt-4 pb-16 text-center text-sm text-slate-400">
            {article?.read_at ? "✓ You've read this" : "End"}
          </div>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-lg bg-green-700 px-4 py-2 text-sm text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
