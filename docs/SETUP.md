STUDY TOGETHER: SETUP
=====================

Without any setup the app runs in DEMO MODE (bots, no backend). Follow these
steps to run it for real on Supabase + Vercel. Takes about 20 minutes.


1. RUN IT LOCALLY (demo mode)
-----------------------------
  npm install
  npm run dev
Open http://localhost:5173. No env vars needed.
Tip (demo only): add ?skip=21 to a room URL to shift the clock and preview breaks.
Tip: add ?quality=low|medium|high to force a 3D quality tier.


2. CREATE THE SUPABASE PROJECT
------------------------------
a) https://supabase.com/dashboard -> New project. Pick a region close to your users.
   Save the database password somewhere safe (it is not needed by the app).

b) Run the database migration:
   Dashboard -> SQL Editor -> New query.
   Paste the whole file supabase/migrations/20261022000000_study_together.sql
   and press Run. It should finish with "Success. No rows returned".
   (If you use the Supabase CLI instead: supabase link, then supabase db push.)

c) Turn on anonymous sign-ins:
   Dashboard -> Authentication -> Sign In / Providers
   -> "Allow anonymous sign-ins" = ON -> Save.

d) Realtime: make channels private-only:
   Dashboard -> Project Settings -> Realtime
   -> "Allow public access" = OFF -> Save.
   (The app only uses private channels; the migration adds the policies that let
   room members receive messages and use Presence.)

e) Copy your keys:
   Dashboard -> Project Settings -> API (or "API Keys")
     Project URL               -> this is VITE_SUPABASE_URL
     anon / publishable key    -> this is VITE_SUPABASE_ANON_KEY
   Never use the service_role / secret key in this app.


3. CLOUDFLARE TURNSTILE (bot protection on sign-in)
---------------------------------------------------
a) https://dash.cloudflare.com -> Turnstile -> Add widget.
     Widget name: Study Together
     Hostnames:   your Vercel domain (e.g. study-together.vercel.app),
                  plus any custom domain, plus localhost
     Widget mode: Managed
   Create. You get a SITE KEY (public) and a SECRET KEY (private).

b) Give the SECRET key to Supabase (not to the app):
   Supabase Dashboard -> Authentication -> Attack Protection
   (older dashboards: Authentication -> Settings -> Bot and Abuse Protection)
   -> Enable CAPTCHA protection = ON
   -> Choose CAPTCHA provider = Turnstile by Cloudflare
   -> CAPTCHA secret = paste the Turnstile SECRET key -> Save.

c) The SITE key goes into the app as VITE_TURNSTILE_SITE_KEY (step 4).

For local testing with captcha on, Cloudflare's always-pass test keys are:
   site key   1x00000000000000000000AA
   secret key 1x0000000000000000000000000000000AA
(Put the test secret in Supabase only while testing, then switch back.)


4. ENVIRONMENT VARIABLES
------------------------
Local: copy .env.example to .env.local and fill in:
   VITE_SUPABASE_URL=https://YOURPROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ... (anon / publishable key)
   VITE_TURNSTILE_SITE_KEY=0x4AAAA... (Turnstile site key)
Restart npm run dev after changing env vars. .env.local is git-ignored.

All three are public, browser-safe values. Security comes from RLS and the
server-side functions, not from hiding these.


5. DEPLOY ON VERCEL
-------------------
a) https://vercel.com/new -> Import the Git repository.
b) Framework Preset: Vite. Build Command: npm run build. Output Directory: dist.
   (vercel.json already rewrites /room/... URLs to index.html.)
c) Settings -> Environment Variables. Add, for Production AND Preview:
     VITE_SUPABASE_URL        = (from 2e)
     VITE_SUPABASE_ANON_KEY   = (from 2e)
     VITE_TURNSTILE_SITE_KEY  = (from 3a)
d) Deployments -> Redeploy (env vars are baked in at build time).
e) Add the final domain to the Turnstile widget's hostnames (3a) if you haven't.


6. OPTIONAL BUT RECOMMENDED
---------------------------
Cleanup job (keeps tables small):
   Dashboard -> Database -> Extensions -> enable "pg_cron".
   SQL Editor -> run:
     select cron.schedule('study-together-cleanup', '17 * * * *', 'select public.cleanup_old_rows()');

Anonymous sign-in rate limit:
   Dashboard -> Authentication -> Rate Limits -> "Anonymous users" (default 30/hour per IP).
   Raise it if many people share one network (schools, libraries).

Reading reports:
   Dashboard -> Table Editor -> reports (newest at the bottom; sort by created_at).
   To ban someone everywhere, delete the user in Authentication -> Users.


7. MUSIC (optional)
-------------------
Put royalty-free audio files (mp3 or ogg) in public/music/ and list them in
public/music/manifest.json, for example:
   { "tracks": [
       { "title": "Night Walk", "artist": "Someone", "src": "/music/night-walk.mp3",
         "license": "CC BY 4.0, https://..." }
   ] }
The music button appears automatically once the list is not empty.
Only use tracks whose license allows this use; keep the license info in the manifest.


8. ADS
------
src/components/BreakAd.tsx is a clearly marked placeholder. Put the ad network's
tag inside the .ad-frame element for each slot ("break-card", "interstitial").
Ads only render during breaks; the full-screen one is capped to one per ~35 minutes.
