# NZOS 1.0 for Intel Mac

Install NZOS.app in Applications. At the first location prompt, select a folder inside your Mac account. NZOS creates Database, Downloads, Backups, App Assets and Source Code inside an NZOS folder at that location. Close any older copy of the app before opening the new one.

The in-app upgrade from 0.1.11 uses the compatibility DMG. Its Finder filename stays Nizamia App-2A.app. The running application identifies itself as NZOS. The automatic upgrade places its workspace in an NZOS folder beside the existing database folder. The existing database is copied with a verified backup before the active database setting changes.

Sign in online once and check Connected. Supported PDF exports write the user-selected copy and a second copy in Downloads in the NZOS workspace. Database backups are available under NZOS → Mac Maintenance to an administrator. Recovery verifies the selected file and creates a separate copy.

## Owner source and rebuilding

Extract the version-matched source archive into the Source Code folder on the owner's Mac. The repository snapshot includes app and server source, database definitions, assets, templates, CI workflows and dependency manifests. The owner archive includes the desktop dependency lockfile produced on the Intel build host. The installed app contains its runtime dependencies. See desktop/.env.example for configuration names.

On an Intel Mac with Node 22, run npm ci in the project root, APP2A_DESKTOP_BUILD=1 npm run build, then npm ci and npm run dist:mac inside desktop. The resulting installer is in desktop/release. Builds in this workflow are unsigned.

## Recovery checkpoint

The previous release is v0.1.11 at b6c446322a8f1c8576a19d0f121913143d1d0866. Its Intel DMG SHA-256 is 8729d87b634e309c793bd873e59ae2497fc9ad62211dadf952692c80b4e675c7.

For rollback, close NZOS, retain its current database and verified backup, and recover the chosen backup to a separate directory. Open a verified copy with the compatible app version before switching an active database. Keep any newer pending edits until reconciled. Future database formats require a separate compatibility check.
