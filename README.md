# Blitz Fixture Maker

A browser-based tool for creating balanced youth blitz fixtures, fine-tuning the schedule, applying club branding, and exporting a landscape PNG poster.

## Features

- Event timing and pitch configuration
- Round-robin groups or custom fixtures
- Automatic club-name detection
- Same-club avoidance where possible
- Balanced partial round-robin scheduling
- Drag-and-drop fixture editing
- Club colours, crest, rules, and host information
- Live poster preview and PNG export
- Session-only browser storage

## Run locally

```bash
npm install
npm run dev
```

## Deploy to GitHub Pages

The repository includes a GitHub Actions workflow that builds and deploys the app after every push to `main`.

After creating the repository, open **Settings → Pages** and select **GitHub Actions** as the source. The published URL will be:

```text
https://YOUR-USERNAME.github.io/blitz-fixture-maker/
```

If you rename the repository, update `base` in `vite.config.ts` to match the new repository name.
