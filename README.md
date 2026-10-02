# Gatipath v0.1

A premium Indian train-status UI prototype.

## Run locally
1. Install Node.js 18+.
2. In this folder run `npm install`.
3. Run `npm run dev`.
4. Open the local URL Vite prints.

## Current state
- Fully interactive prototype
- Mock data for Himalayan Queen and Telangana Express
- Search by name/number
- Direction selection
- Vertical journey timeline
- Not-started/running/scheduled states
- Boarding-station highlighting
- Responsive mobile layout

## Live API integration
The UI is deliberately separated from the railway data source. A production version should use a server-side API layer and keep API keys off the browser. RailRadar currently documents a live train endpoint with current location, delay, route, ETA/ETD and exception fields; validate its commercial terms, reliability and quotas before production use.

Deployment configuration updated.
