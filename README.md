# RailDisha

RailDisha is a one-page Indian train journey tracker. The public website domain is https://raildisha.com.

## Live data

The app uses RailRadar through Vercel serverless functions. Keep `RAILRADAR_API_KEY` in Vercel Environment Variables; never put the key in frontend code.

- `/api/search?q=Himalayan%20Queen` searches the RailRadar train directory.
- `/api/train/14095` retrieves live status for a train number.

If live data is unavailable, the app reports the error instead of showing fake live status.

## Brand assets

- `public/raildisha-logo.png` — header logo (transparent background derived from the official artwork)
- `public/raildisha-logo-source.png` — original supplied logo artwork

The logo artwork already includes the Hindi tagline, so the header does not render duplicate tagline text.

## Local development mocks

Development-only mock mode uses the existing `GATIPATH_MOCK` / `VITE_GATIPATH_MOCK` environment variable names. Those identifiers are intentionally left unchanged so local and hosted mock wiring keeps working.

## Hosting

Production is published through the existing Vercel GitHub integration for this repository (`gatipath.vercel.app`). Custom domain `raildisha.com` is documented as the intended public site; connecting it requires authorized Vercel project domain access.
