# Gatipath

Gatipath is a one-page Indian train journey tracker.

## Live data

The app uses RailRadar through Vercel serverless functions. Keep `RAILRADAR_API_KEY` in Vercel Environment Variables; never put the key in frontend code.

- `/api/search?q=Himalayan%20Queen` searches the RailRadar train directory.
- `/api/train/14095` retrieves live status for a train number.

If live data is unavailable, the app reports the error instead of showing fake live status.
