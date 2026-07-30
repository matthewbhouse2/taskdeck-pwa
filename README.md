# TaskDeck — standalone PWA build

This is your task/goal/tracker/Journey app, rebuilt to run on its own — installable
to a phone home screen, syncing across devices via Supabase. All the app logic,
theming, calendar, tracker, and Journey/RPG system are unchanged from the Claude
artifact version — only the storage layer was swapped.

## 1. Create a free Supabase project
1. Go to https://supabase.com → sign up (free) → "New project"
2. Once it's created, open **SQL Editor** → paste in the contents of `supabase/schema.sql` → run it
3. Go to **Project Settings → API** → copy your **Project URL** and **anon public key**

## 2. Configure the app
1. Copy `.env.example` to `.env`
2. Paste in your Project URL and anon key:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
3. In Supabase, go to **Authentication → Providers → Email** and make sure "Enable Email provider" is on
   (magic-link sign-in is on by default — no extra setup needed)

## 3. Run it locally to test
```
npm install
npm run dev
```
Open the URL it gives you, enter your email, check your inbox for the sign-in link.

## 4. Deploy it for real (free)
The easiest path is **Vercel**:
1. Push this folder to a GitHub repo
2. Go to https://vercel.com → sign up (free) → "Add New Project" → import your repo
3. Vercel auto-detects Vite. Before deploying, add your two environment variables
   (same as your `.env`) under Project Settings → Environment Variables
4. Deploy. You'll get a real URL like `taskdeck.vercel.app`

## 5. Install it like an app
Open your deployed URL on your phone:
- **iPhone (Safari)**: Share button → "Add to Home Screen"
- **Android (Chrome)**: menu (⋮) → "Install app" / "Add to Home Screen"

It'll behave like a real app from there — its own icon, full-screen, no browser bar.

## Notes
- Your data now lives in Supabase under your account, synced across every device
  you sign in on with the same email.
- Notifications: browser notification permission works the same as before, but
  only fires while the app/tab is open — this build doesn't include background
  push notifications (that's a further step if you want it later).
- If you ever want a true native App Store / Play Store listing instead of (or
  in addition to) this, this same project is the starting point — wrapping it
  with Capacitor is the next step, and it needs your own Apple/Google developer
  accounts to actually publish.
