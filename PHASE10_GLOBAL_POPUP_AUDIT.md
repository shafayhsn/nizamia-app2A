# Phase 10 — Global Popup Audit / Payment Settlement

Base: user-tested Phase 9 shipping popup source.

## Implemented
- Payment Settlement editor now registers with the existing shared Window Manager, with Minimize and Close controls.
- The editor remains mounted while minimized; unsaved form state is retained during minimization.
- Close via the header asks for confirmation, using the existing managed-popup hook.
- No changes to page layout, navigation, settlement calculations, Supabase operations or unrelated dialogs.

## Not verified / remaining
- Cross-page persistence of the Payment Settlement editor has not been independently verified. The Shipping page's routing lifecycle must be tested before claiming it works.
- Other non-editor dialogs (status pickers, column settings, confirmations, report dialogs) were intentionally not converted without reviewing their interaction semantics.
- Other pages may contain further eligible editors; no claim of complete application-wide coverage is made.
- Browser runtime testing and full Vite compilation not completed in this environment.

## Suggested acceptance test
Open Payments > Edit Settlement; modify a field; minimize; restore; confirm the field is retained; close and confirm prompt; reopen and check the original saved value remains unchanged. Then navigate to Orders and check whether the minimized settlement remains in the tray.
