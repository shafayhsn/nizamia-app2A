# Booking & Shipping update — 26 October 2026

Source changes:
- Bookings tab now reads `shipping_bookings`, `shipping_booking_lines` and `shipping_booking_shipments` rather than mirroring the Queue table.
- New Booking supports selecting multiple queues or orders without queues, with per-line quantities.
- Booking toolbar has Edit/Delete and configurable columns; totals and filters are browser-persisted.
- Shipments header now has +New Shipment > From Booking / Record Past Shipment / Manual Shipment.
- Existing historical shipment modal has not been modified.
- Direct shipment creation writes shipment header/lines, and when from booking writes allocation rows.
- Queue tab includes a filtered totals footer. Existing queue table preference persistence was retained.
- Notification reads table has been installed on the connected Supabase project; failed writes no longer show as successful locally.

Database: migration `migrations/20261026_shipping_bookings.sql` has been applied to the connected project using Supabase migrations. The notification_reads table was also created.

**Validation limitation:** The environment could not finish `npm ci` (package registry timeout) and Vite compilation was not completed. This is a SOURCE PREVIEW, not a tested production build. Deploy to a preview environment and test creation, editing, deletion, partial shipments, totals, and notifications before promotion.

**Security note:** The app currently uses a custom public.users login and direct browser access to Supabase, with grants to anon. A backend authorization/RLS review is necessary before treating booking and notification records as securely user-scoped.
