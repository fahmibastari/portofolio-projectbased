# Fahmi Bastari — Portfolio

Personal portfolio featuring selected web, mobile, and interactive projects.

## Development

Requires Node.js 24 and npm.

```sh
cd showcase
npm ci
npm run dev
```

## Production

```sh
npm run build
npm run preview
```

The production output is `showcase/dist`. The root `netlify.toml` installs this application's dependencies, builds it, and publishes that directory. Production uses the `main` branch. The public route fallback supports direct project URLs.

## Project content

`src/generated/projects.json` contains project metadata. `src/presentations.json` selects and orders the 11 featured projects. `public/thumbnails` contains presentation artwork; case studies use the original project screenshots in `public/boards` and `public/media`.

The site includes the featured gallery, full project index, project details, profile, and newsletter email request. Reduced motion and unavailable WebGL use a flat gallery. No newsletter subscription backend is connected.

`scripts/prepare-assets.mjs` regenerates project data from the original portfolio sources and locally available screenshots. Source artwork, visual studies, capture scripts, audit reports, and test recordings are kept locally outside the published source tree.
