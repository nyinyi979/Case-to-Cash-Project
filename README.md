# C2C Sketchbook

React and Vite app for the C2C Legal & Enforcement sketchbook.

## Structure

- `src/components/` contains the header, stage, controls, loading screen, and book experience components.
- `src/pages/` contains one dynamically imported module per book page.
- `src/pageManifest.js` maps page metadata to dynamic imports.
- `src/legacyBook.js` prepares page artwork and manages page-turn behavior.
- `src/pageCurl.js` renders the touch-driven paper bend and its front/back artwork.
- `src/styles.css` contains the book layout, material details, and animation styles.
- `photos/` contains the original photo assets; copies used in the book are embedded in the page modules.

## Run locally

```sh
npm install
npm run dev
```

Create the deployable static site with `npm run build`. Deploy the generated `dist/` directory to Netlify.

To check page-turn interactions, open `/tests/page-curl.html` on the local Vite server. The browser checks cover desktop and mobile turns, short-drag snap-back, cancellation, taps, and keyboard navigation. The preview control holds a diagonal fold for visual inspection. These checks use synthetic pointer events; also try a real mouse or touch drag to verify native pointer capture.

## Deploy to Vercel

Import the repository in Vercel and use the included `vercel.json` settings. Vercel builds with `npm run build` and serves the generated `dist/` directory. No routing rewrite is needed for this single-page book.
