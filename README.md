# YouTube Learning Library

A web app for organizing the YouTube videos you learn from. Anyone can sign in with Google and get their own private library.

- Paste a YouTube link and the title, channel and thumbnail fill in automatically
- Videos added outside a folder are sorted into a folder named after their YouTube channel
- Organize videos into folders and subfolders, and add tags
- Drag videos to reorder them, or drop them onto a folder to move them (on phones, use the "Move to" menu on each video)
- Search across titles, channels, folders and tags
- Take handwritten notes on any video (Apple Pencil, mouse, or finger), with time stamps that jump the video to that moment
- Share any folder with a read-only link
- Works on any device with a browser

Built with Next.js, Tailwind CSS and Supabase. Hosted on Vercel.

## Setup

### 1. Create the Supabase project
1. In [Supabase](https://supabase.com/dashboard), click **New project**. Pick a name and a database password (save it somewhere), and choose the region closest to you.
2. When it's ready, open **SQL Editor → New query**, paste everything from [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
   (Set up before notes existed? Run [`supabase/notes.sql`](supabase/notes.sql) the same way.)
3. Open **Project Settings → API** (or **Data API**) and copy the **Project URL** and the **anon public** key.

### 2. Turn on Google sign-in
1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials), create an **OAuth client ID** of type **Web application**.
2. Under **Authorized redirect URIs**, add `https://<your-project-id>.supabase.co/auth/v1/callback`.
3. In Supabase, go to **Authentication → Sign In / Providers → Google**, turn it on, and paste the Client ID and Client Secret.

### 3. Deploy on Vercel
1. In [Vercel](https://vercel.com/new), import this GitHub repository.
2. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = your Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = your anon public key
3. Click **Deploy**.
4. Back in Supabase, go to **Authentication → URL Configuration**. Set **Site URL** to your Vercel address (like `https://youtube-learning-library.vercel.app`) and add `https://youtube-learning-library.vercel.app/**` to **Redirect URLs**.

## Running it on your own computer (optional)

```bash
npm install
cp .env.example .env.local   # then fill in the two values
npm run dev
```

Open http://localhost:3000. Add `http://localhost:3000/**` to Supabase's Redirect URLs so sign-in works locally.
