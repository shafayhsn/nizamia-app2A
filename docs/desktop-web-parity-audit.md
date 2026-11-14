# App-2A desktop parity audit (14 November 2026)

## Scope
The existing App-2A web implementation is the source of truth. The desktop application must not invent business modules, redefine workflows or treat navigation placeholders as completed functionality. Offline persistence is a delivery requirement, not authorization to change business behavior.

## Confirmed web modules and implementation differences

| Web source | Actual web behavior observed | Desktop status | Gap / action |
| --- | --- | --- | --- |
| `src/pages/Production.jsx` | Nine departments: Cutting, Stitching, Washing, Back Process, Finishing, Packing, Embroidery, Printing, Other; order-size-color variant handling | Local production entries and plans, basic stage balances | Department selector now aligned. Full size/color variant workflows, movements, reporting and web table interactions not yet reproduced. Production plans must be treated as provisional until their equivalent web workflow is verified. |
| `src/components/tools/CostingSheet.jsx` | Detailed woven/knit costing: fabric consumption/rates, cutting and making, washing, trims, embellishment, PKR costing, exchange rates, profit and agency percentages | Simple five-component cost sheet and FOB margin preview | NOT equivalent. Do not represent the simplified form as web costing parity; detailed section calculations, currency handling and quote report remain. |
| `src/pages/PPMeeting.jsx` | Order-linked PP meeting, department notes, technical checks, decision, outstanding actions and supporting attachment | Basic standalone PP meeting fields | NOT equivalent. Department checklist, structured technical checks, attachments and meeting decisions remain. |
| `src/pages/Orders.jsx` | Order workflow includes related size groups and color breakdowns | Basic offline order records | Not equivalent; breakdowns, BOM and packing need explicit implementation audit. |
| `src/pages/ProductionFormats.jsx` | Production report formats | Snapshot report and format export foundation | Verify actual web format inventory and customization against offline exports. |

## Acceptance criteria before declaring feature parity
1. Inspect the relevant web page/component and supporting API or schema before implementing desktop changes.
2. Record which web fields, calculations, filters, export formats and relationships are supported offline.
3. Exercise offline create/edit/read/export with real linked records and confirm data survives app restart.
4. Keep existing web naming, workflow semantics and supported departments.
5. Label incomplete offline screens clearly; do not imply they are identical to web.
6. Verify an actual Intel Mac DMG launches and works without connectivity. CI success alone is not a user acceptance test.

## Build interpretation
A successful GitHub Actions build means tests and packaging passed. It does not certify web parity or complete offline workflows. The historical ~68% engineering estimate is provisional, not measured parity.
