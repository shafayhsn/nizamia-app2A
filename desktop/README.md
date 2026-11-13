# App-2A Desktop — macOS Intel pilot

This is the **first online-only Electron shell prototype**, not an offline application. It opens the existing production web app in a dedicated desktop window. It does not access PostgreSQL directly, install SQLite, synchronize offline changes, or modify Supabase.

## Requirements
- macOS Ventura 13.7.8, Intel x86_64 (first test machine)
- Node.js and npm for building; internet access for the app
- No Supabase database password

## Build on the Intel Mac
```bash
cd desktop
npm install
npm run start
npm run dist:mac
```
Find the generated Intel .dmg under `desktop/release/`.

**Note:** The build has not been run or validated yet. Unsigned / unnotarized DMGs may be blocked by macOS Gatekeeper. Do not bypass security controls on an untrusted build. Production distribution requires signing/notarization.

## Current behavior and limits
- Uses `https://app.nizamia.com` directly, so normal application authentication and permissions still apply.
- This is a hosted-webview proof of concept. Without internet, it cannot load or save data.
- The Electron renderer has Node integration disabled, context isolation and sandbox enabled.
- Non-App-2A HTTPS links open in the system browser.
- Existing printing, downloads, popup-based exports, and sign-in behavior still require hands-on validation.
- No service-role key or database password is embedded.

## Next engineering stage
Package the local React/Vite bundle with a safe custom application protocol, handle relative /api calls, introduce SQLite in the Electron main process and a validated IPC bridge, then implement an offline-first pilot with conflict-safe synchronization.
