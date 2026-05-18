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

## CMS Features

- Hero content and background media
- Brand colors and typography
- Services with image/icon/category/reorder/visibility
- Video showcase with YouTube live autoplay muted previews and sound toggles
- Founder section with image upload, bio, role, and social links
- Stats, testimonials, team, contact, Instagram, and WhatsApp
- Media uploads and deletion
- Animation settings
