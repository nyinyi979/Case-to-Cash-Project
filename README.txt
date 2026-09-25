C2C Sketchbook (Next Gen Collection 2027 - Legal & Enforcement)

React + Vite app.

src/components/ - separate React components for the book experience.
src/pages/      - individual dynamically loaded page modules.
src/legacyBook.js - book page preparation and page-turn behavior.
photos/         - source copies of the 3 photos used in the book.

Run locally:
  npm install
  npm run dev

Vercel deployment is configured in vercel.json. Vercel runs `npm run build` and publishes `dist/`.
