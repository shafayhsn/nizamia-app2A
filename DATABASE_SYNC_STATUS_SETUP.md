# Database Sync Status setup

Run `supabase/migrations/20261022_database_sync_status.sql` in the Supabase SQL Editor for the App-2A project **before** deploying this build. This creates a single global last-write timestamp, updated by statement-level triggers for public application tables. It does not backfill earlier writes; it starts recording when the migration is applied. The app polls every 30 seconds and displays `Unavailable` if the table is inaccessible; it does not invent a timestamp.

New tables created later need the trigger installed too (re-run the DO block in the migration). Only authenticated users can read the status; client users cannot directly write it. The timestamp means the last tracked database write, not a guarantee that another user's changes have been downloaded into this browser.
