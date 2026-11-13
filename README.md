# BobaSip Milktea Shop

Static HTML + vanilla JS (Tailwind-style CSS), hosted on Vercel. All data is stored in the browser (localStorage).

## Structure
- `*.html` - pages (welcome, login, signup, home, menu, cart, checkout, confirmation, track, profile, orders, addresses, payments, notifications, settings, admin)
- `js/main.js` - shared logic (auth, cart, orders, admin, routing)
- `css/style.css`, `images/` - styles and assets
- `vercel.json` - clean URLs, rewrites, security headers

## Flow
User: sign up/login -> menu -> cart -> checkout -> order (Pending) -> track/cancel.
Admin (`admin@bobasip.com` / `admin123`): updates order status, hides/shows or adds products, sees real sales stats.
Demo user: `user@bobasip.com` / `user123`.

## Known limitation
This version keeps the existing localStorage-based single-browser behavior for order management. Cross-device synchronization requires a backend.

## Supabase setup (optional, for real cross-device sync)
1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Create an admin user and set its profile role to `admin`.
4. Copy `.env.example` to `.env` and fill `SUPABASE_URL` and `SUPABASE_ANON_KEY` (anon/public key only).
5. Never expose the service-role key in frontend code. Use server-side functions or RLS for privileged operations.
6. Update frontend to use the Supabase client with the anon key; rely on RLS for authorization.

Without these credentials, the app runs in localStorage mode and does not synchronize across devices.

## Deploy
`vercel --prod` from this folder.
