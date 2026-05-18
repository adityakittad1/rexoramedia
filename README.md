# Rexora Media

Premium animated website and hidden Admin CMS for Rexora Media.

## Run Locally

```powershell
npm run dev
```

Open:

- Website: `http://127.0.0.1:4174`
- Hidden admin: click the Rexora Media logo, or open `http://127.0.0.1:4174/admin/login`

## Admin Security

Admin credentials are loaded from `.env`. Do not commit `.env`.

Create `.env` from `.env.example` and set:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH`
- `SESSION_SECRET`

The app uses a signed HttpOnly cookie for the admin session.

## Deploying on Vercel

This project uses `server.js` as a Vercel serverless handler through `vercel.json`.

Add these Environment Variables in Vercel Project Settings:

- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH`
- `SESSION_SECRET`

Important: Vercel serverless functions have a read-only deployment filesystem. The included JSON CMS works locally and can update in memory on Vercel during a warm function instance, but production-persistent CMS edits and uploads should use a hosted database/storage service such as Supabase, MongoDB Atlas, Vercel KV, or Vercel Blob.

## CMS Features

- Hero content and background media
- Brand colors and typography
- Services with image/icon/category/reorder/visibility
- Video showcase with YouTube live autoplay muted previews and sound toggles
- Founder section with image upload, bio, role, and social links
- Stats, testimonials, team, contact, Instagram, and WhatsApp
- Media uploads and deletion
- Animation settings
