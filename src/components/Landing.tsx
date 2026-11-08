import Link from "next/link";
import {
  BookOpenCheck,
  FileText,
  KeyRound,
  LibraryBig,
  Link2,
  LockKeyhole,
  NotebookPen,
  Pencil,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Timer,
  type LucideIcon,
} from "lucide-react";
import SignInButton from "@/components/SignInButton";
import { Ico, type Tone } from "@/components/Icon";
import { BRAND } from "@/lib/brand";

// What someone sees before signing in: what BrainShelf is, what it looks like, and a way in.
export default function Landing({ error }: { error?: string }) {
  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <span className="flex items-center gap-1.5 text-lg font-bold">
            <Ico icon={LibraryBig} tone="blue" size={22} />
            {BRAND.name}
          </span>
          <nav className="ml-auto hidden items-center gap-5 text-sm text-slate-600 sm:flex">
            <a href="#how" className="hover:text-slate-900">
              How it works
            </a>
            <a href="#features" className="hover:text-slate-900">
              Features
            </a>
            <a href="#faq" className="hover:text-slate-900">
              FAQ
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
            <Ico icon={LibraryBig} tone="blue" size={15} />
            {BRAND.name}: {BRAND.tagline}
          </p>
          <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-6xl">{BRAND.headline}</h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">{BRAND.description}</p>
          <div id="start" className="mt-8 flex flex-col items-center gap-2">
            <SignInButton />
            <p className="text-sm text-slate-500">Sign in with your Google account. Works on your laptop and phone.</p>
            {error && <p className="text-sm text-red-600">Sign-in didn&apos;t work. Please try again.</p>}
          </div>
          <Shot src="/landing/videos.webp" alt="Your video library in BrainShelf, with folders, notes and summaries" className="mt-12" />
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16">
        <h2 className="text-center text-3xl font-bold">How it works</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <Step n={1} icon={Link2} tone="sky" title="Paste a link" text="A YouTube video, an article, an X post or a tutorial. BrainShelf fills in the title for you." />
          <Step n={2} icon={Pencil} tone="yellow" title="Take notes beside it" text="Type or handwrite while you watch or read, and pin the moment in the video that matters." />
          <Step n={3} icon={BookOpenCheck} tone="green" title="Come back and remember" text="Everything sits on your shelf, sorted and searchable, with your notes and summaries." />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="scroll-mt-16 bg-slate-50 py-16">
        <div className="mx-auto flex max-w-6xl flex-col gap-16 px-4">
          <Feature
            icon={NotebookPen}
            tone="amber"
            title="Notes right beside the video"
            text="Watch on the left, write on the right. Stamp the time to jump back later, handwrite with a pen, or clip a picture of the screen into your notes."
            points={[
              { icon: Timer, tone: "red", text: "Stamp time, and tap it to jump back" },
              { icon: Sparkles, tone: "yellow", text: "Ask AI for a summary, the key ideas or a quiz" },
            ]}
            src="/landing/study.webp"
            alt="The notes page: a video on the left, typed notes and Ask AI on the right"
          />
          <Feature
            icon={FileText}
            tone="sky"
            title="Articles and tutorials too"
            text="Save posts, articles and how-to guides in their own tabs. Add a line on why you saved it, read it in the app, and tick it off when you're done."
            src="/landing/reading.webp"
            alt="The Reading tab with categories, notes and read ticks"
            flip
          />
          <Feature
            icon={NotebookPen}
            tone="orange"
            title="A ScrapBook for your own ideas"
            text="Pages of your own for plans, ideas and sketches. Type freely or draw, and sort pages into categories."
            src="/landing/scrapbook.webp"
            alt="The ScrapBook with pages sorted into categories"
          />
          <Feature
            icon={LockKeyhole}
            tone="yellow"
            title="Securely save your API keys"
            text="The Vault keeps the API keys and logins you use while learning in one safe place. They're locked with your own passphrase in your browser before they're saved, so nobody else can read them, not even BrainShelf."
            points={[
              { icon: KeyRound, tone: "yellow", text: "API keys and passwords, encrypted" },
              { icon: LockKeyhole, tone: "slate", text: "Locks itself after 5 idle minutes" },
            ]}
            src="/landing/vault.webp"
            alt="The Vault, locked, with an API key and a login saved"
            flip
          />
        </div>
      </section>

      {/* Trust */}
      <section className="mx-auto grid max-w-6xl gap-4 px-4 py-16 sm:grid-cols-3">
        <Trust icon={ShieldCheck} tone="green" title="Private to you" text="Your library is yours. Nothing is shared unless you share a folder link yourself." />
        <Trust icon={LockKeyhole} tone="yellow" title="Encrypted Vault" text="Secrets are locked in your browser with a passphrase only you know." />
        <Trust icon={Smartphone} tone="sky" title="Laptop and phone" text="Use it in any browser. Sign in with Google and your shelf follows you." />
      </section>

      {/* FAQ */}
      <section id="faq" className="scroll-mt-16 bg-slate-50 py-16">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-center text-3xl font-bold">Questions</h2>
          <div className="mt-8 flex flex-col gap-3">
            <Faq q="What do I sign in with?" a="Your Google account. There's no new password to remember." />
            <Faq q="What can I save?" a="YouTube videos, articles, X posts, tutorials and course pages, plus your own ScrapBook pages and Vault entries." />
            <Faq q="Does it work on my phone?" a="Yes. It runs in your phone's browser, and you can draw notes with your finger or a pen." />
            <Faq q="Who can see my notes?" a="Only you. If you share a folder, people with the link see the videos in it, not your notes." />
            <Faq q="Can BrainShelf read my Vault?" a="No. Passwords and API keys are encrypted with your passphrase before they leave your browser." />
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="mx-auto max-w-6xl px-4 py-16 text-center">
        <h2 className="text-balance text-3xl font-bold">Start your shelf today</h2>
        <p className="mt-2 text-slate-600">{BRAND.description}</p>
        <div className="mt-6 flex justify-center">
          <SignInButton />
        </div>
      </section>

      <footer className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-6 text-sm text-slate-500">
          <span className="flex items-center gap-1.5 font-semibold text-slate-700">
            <Ico icon={LibraryBig} tone="blue" size={16} />
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

// A screenshot of the app in a simple browser frame.
function Shot({ src, alt, className = "" }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`overflow-hidden rounded-xl bg-white shadow-xl ring-1 ring-slate-200 ${className}`}>
      <div className="flex gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-300" />
      </div>
      <img src={src} alt={alt} className="block w-full" loading="lazy" />
    </div>
  );
}

function Step(props: { n: number; icon: LucideIcon; tone: Tone; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">{props.n}</span>
        <Ico icon={props.icon} tone={props.tone} size={22} />
      </div>
      <h3 className="mt-3 text-lg font-semibold">{props.title}</h3>
      <p className="mt-1 text-slate-600">{props.text}</p>
    </div>
  );
}

function Feature(props: {
  icon: LucideIcon;
  tone: Tone;
  title: string;
  text: string;
  points?: { icon: LucideIcon; tone: Tone; text: string }[];
  src: string;
  alt: string;
  flip?: boolean;
}) {
  return (
    <div className="grid items-center gap-8 md:grid-cols-5">
      <div className={`md:col-span-2 ${props.flip ? "md:order-last" : ""}`}>
        <Ico icon={props.icon} tone={props.tone} size={32} />
        <h3 className="mt-3 text-2xl font-bold">{props.title}</h3>
        <p className="mt-2 text-slate-600">{props.text}</p>
        {props.points && (
          <ul className="mt-4 flex flex-col gap-2">
            {props.points.map((p) => (
              <li key={p.text} className="flex items-center gap-2 text-slate-700">
                <Ico icon={p.icon} tone={p.tone} size={18} />
                {p.text}
              </li>
            ))}
          </ul>
        )}
      </div>
      <Shot src={props.src} alt={props.alt} className="md:col-span-3" />
    </div>
  );
}

function Trust(props: { icon: LucideIcon; tone: Tone; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <Ico icon={props.icon} tone={props.tone} size={26} />
      <h3 className="mt-2 font-semibold">{props.title}</h3>
      <p className="mt-1 text-sm text-slate-600">{props.text}</p>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white p-4">
      <summary className="cursor-pointer list-none font-semibold">
        {q}
        <span className="float-right text-slate-400 group-open:rotate-45">+</span>
      </summary>
      <p className="mt-2 text-slate-600">{a}</p>
    </details>
  );
}
