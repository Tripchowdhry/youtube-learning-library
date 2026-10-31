import Link from "next/link";

export const metadata = { title: "Privacy Policy · StudyShelf" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12 leading-relaxed">
      <h1 className="mb-6 text-3xl font-bold">Privacy Policy</h1>
      <p className="mb-4">
        StudyShelf lets you save and organize links to YouTube videos, articles and tutorials. This page explains what we
        store and why.
      </p>
      <h2 className="mt-6 mb-2 text-xl font-semibold">What we collect</h2>
      <ul className="mb-4 list-disc pl-6">
        <li>Your email address and name from Google, so you can sign in.</li>
        <li>The folders, video links, titles and tags you add to your library.</li>
      </ul>
      <h2 className="mt-6 mb-2 text-xl font-semibold">How it&apos;s used</h2>
      <p className="mb-4">
        Your data is only used to show you your own library. It is private to your account unless you choose to share
        a folder, in which case anyone with that folder&apos;s link can view it. We don&apos;t sell your data or show ads.
      </p>
      <h2 className="mt-6 mb-2 text-xl font-semibold">Where it&apos;s stored</h2>
      <p className="mb-4">Your library is stored securely with Supabase. The app is hosted on Vercel.</p>
      <h2 className="mt-6 mb-2 text-xl font-semibold">Deleting your data</h2>
      <p className="mb-4">
        You can delete any video or folder at any time. To delete your whole account, contact the app owner through{" "}
        <a href="https://github.com/Tripchowdhry/youtube-learning-library/issues" className="underline">
          the project page
        </a>
        .
      </p>
      <p className="mt-10 text-sm text-slate-500">
        <Link href="/" className="underline">
          Back to the app
        </Link>
      </p>
    </main>
  );
}
