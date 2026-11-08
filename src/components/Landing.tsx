import Link from "next/link";
import { ArrowUp, Eye } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import SignInButton from "@/components/SignInButton";
import LandingTour from "@/components/LandingTour";
import { Ico } from "@/components/Icon";
import { BRAND } from "@/lib/brand";

// What someone sees before signing in: what BrainShelf is, what it looks like, and a way in.
export default function Landing({ error }: { error?: string }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <span className="flex items-center gap-1.5 text-lg font-bold">
            <BrandLogo size={24} />
            {BRAND.name}
          </span>
          <nav className="ml-auto hidden items-center gap-5 text-sm text-slate-600 sm:flex">
            <a href="#faq" className="hover:text-slate-900">
              Tour and FAQ
            </a>
          </nav>
          <a href="#start" className="ml-auto rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-700 sm:ml-0">
            Sign in
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-gradient-to-b from-blue-50 to-white">
        <div className="mx-auto max-w-6xl px-4 pt-14 pb-10 text-center sm:pt-20">
          <p className="mx-auto mb-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
            <BrandLogo size={16} />
            {BRAND.name}: {BRAND.tagline}
          </p>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">{BRAND.headline}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">{BRAND.description}</p>
          <div id="start" className="mt-8 flex scroll-mt-40 flex-col items-center gap-2">
            <SignInButton />
            <p className="text-sm text-slate-500">Sign in with your Google account. Works on your laptop and phone.</p>
            {error && <p className="text-sm text-red-600">Sign-in didn&apos;t work. Please try again.</p>}
          </div>
          <Shot src="/landing/videos.webp" alt="Your video library in BrainShelf, with folders, notes and summaries" label="your video library" className="mt-12" />
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-16 bg-slate-50 py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-bold">Tour and questions</h2>
          <div className="mt-8 flex flex-col gap-3">
            <Faq q="What does BrainShelf look like?" open a={<>A quick picture tour of the main screens: videos, notes, reading, the ScrapBook and the Vault.<br /><LandingTour /></>} />
            <Faq q="What do I sign in with?" a="Your Google account. There's no new password to remember." />
            <Faq q="What can I save?" a="YouTube videos, articles, X posts, tutorials and course pages, plus your own ScrapBook pages and Vault entries." />
            <Faq q="Does it work on my phone?" a="Yes. It runs in your phone's browser, and you can draw notes with your finger or a pen." />
            <Faq q="Who can see my notes?" a="Only you. If you share a folder, people with the link see the videos in it, not your notes." />
            <Faq q="Can BrainShelf read my Vault?" a="No. Passwords and API keys are encrypted with your passphrase before they leave your browser." />
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="mx-auto max-w-6xl px-4 py-14 text-center">
        <h2 className="text-balance text-3xl font-bold">Start your shelf today</h2>
        <div className="mt-6 flex justify-center">
          <SignInButton />
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-6 text-sm text-slate-500">
          <span className="flex items-center gap-1.5 font-semibold text-slate-700">
            <BrandLogo size={18} />
            {BRAND.name}
          </span>
          <span>{BRAND.tagline}</span>
          <Link href="/privacy" className="ml-auto underline">
            Privacy policy
          </Link>
        </div>
      </footer>
    </div>
  );
}

// A screenshot of the app in a browser frame, marked as a preview. Clicking it goes to sign-in,
// since a picture can't be used; hovering says so.
function Shot({ src, alt, label, className = "" }: { src: string; alt: string; label: string; className?: string }) {
  return (
    <a
      href="#start"
      title="This is a picture of the app. Sign in to try it."
      className={`group relative block overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200 ${className}`}
    >
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
        <span className="ml-auto flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
          <Ico icon={Eye} tone="slate" size={13} />
          Preview: {label}
        </span>
      </div>
      <img src={src} alt={alt} draggable={false} className="block w-full select-none" loading="lazy" />
      <span className="pointer-events-none absolute inset-0 top-9 flex items-center justify-center bg-slate-900/0 opacity-0 transition group-hover:bg-slate-900/35 group-hover:opacity-100">
        <span className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-lg">
          This is a preview. Sign in to try it
          <ArrowUp size={16} aria-hidden />
        </span>
      </span>
    </a>
  );
}

function Faq({ q, a, open }: { q: string; a: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer list-none font-semibold">
        {q}
        <span className="float-right text-slate-400 group-open:rotate-45">+</span>
      </summary>
      <div className="mt-2 text-slate-600">{a}</div>
    </details>
  );
}
