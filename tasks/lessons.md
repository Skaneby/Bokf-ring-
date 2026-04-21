# Lessons Learned

## Deployment
- **loadEnv vs process.env**: `loadEnv()` reads `.env` files only — NOT system env vars. GitHub Actions secrets are system env vars. Always use `process.env.X ?? env.X` for CI secrets.
- **Case sensitivity**: GitHub Pages URL matches repo name exactly. `Bokf-ring-` ≠ `bokf-ring-`. Always verify base path matches repo name casing.
- **Branch discipline**: Work only on `main`. GitHub Actions handles all deployment automatically via `actions/deploy-pages@v4`. Never create or push to a `gh-pages` branch.
- **Verify deploy before claiming done**: Always confirm the live URL reflects changes before reporting success.

## React
- **Hooks in JSX**: Never call hooks (`useLiveQuery`, `useState`, etc.) inside JSX return statements or conditionally. Always call at the top level of the component.
- **useLiveQuery auto-updates**: No manual refresh needed after DB changes — all components using `useLiveQuery` update automatically.

## Process
- **Read screenshots carefully**: Console errors contain the exact problem. Don't guess — read every line.
- **Don't loop on the same fix**: If a fix doesn't work after one retry, stop and re-diagnose from scratch.
- **Verify root cause before fixing**: Changing multiple things at once makes it impossible to know what worked.
- **Build before push**: Always run `npm run build` locally and confirm it succeeds before pushing to main.
