# App-2A desktop 0.1.7 release candidate

## Hosted Supabase QA

The free Nizamia desktop QA project was provisioned with synthetic Orders, Buyer and account fixtures. It did not copy production records. The server route handlers were bundled into a QA-only Supabase Edge Function. The test runner exercised the shipped desktop data modules over HTTPS and inspected the resulting SQLite database.

| Scenario | Observed result |
| --- | --- |
| Online enrollment and download | Verified administrator sign-in succeeded. Anonymous snapshot access returned HTTP 401. The authenticated response declared and delivered 62 tables. The synthetic order was readable through the desktop SQLite Orders adapter. |
| Offline reopen | The local credential store was reopened without an online request. The saved account authenticated, and the local order note was available for editing. |
| Desktop upload and retry | The test dropped the response after Supabase processed the request. SQLite retained the pending draft. Retrying produced one acknowledgement and one committed operation. |
| Cloud edit and conflict | A second client committed a competing note. Refresh displayed it in SQLite. The stale draft remained in the owner's conflict queue with its text intact. |
| Database confirmation | A direct database read showed the competing note and two ledger records for the two successfully committed operations. |

The fixture schema establishes the download, persistence, retry and conflict behavior. It does not prove that all production screens or the full production data volume work offline. The live write workflow covers notes on previously synchronized orders for administrators. Other offline records and edits stay local.

## Release gates

Production still serves the web application at the expected desktop snapshot URL. The desktop API and order-note migration were exercised in QA and have not been rolled out to production. The production access review also found anonymous SELECT access on the legacy account table. Desktop production rollout requires a verified replacement for that login path and a migration sequence that preserves the current web sign-in and user administration workflows.

The Intel CI artifacts are unsigned test installers. The runner verifies the disk image, x86_64 binary, bundle ID, version, web assets, packaged runtime files and SHA-256 checksum. CI also exercises the local backup, recovery, update preflight and migration safeguards. Physical Mac acceptance still includes first launch, Keychain session persistence, offline network disconnect/reconnect in the UI, and replacing an installed app through the updater while checking the same local SQLite database afterward.

No GitHub release or production web deployment is part of the candidate build.
