## Context

Both `PRODUCT_MATCH` and `PARTNER_UNKNOWN` dialogs are already implemented in `src/routes/_authenticated/review-queue.tsx` with hooks in `src/lib/product-mapping.ts`. Per your answers, the only change needed is reverting `PARTNER_UNKNOWN` to the original spec (overwrite `partner.contact_email`).

## Changes

### 1. `src/routes/_authenticated/review-queue.tsx` — PartnerUnknownBody

- Add an editable `<Input>` labelled **"Email za dodijeliti partneru"**, pre-filled with `unknownEmail` (from `payload.from_address`), state `emailToAssign`.
- Replace the "will be added as an additional contact…" helper text with a hint that this email becomes the partner's primary `contact_email`.
- Update `handleLink` to pass `fromAddress: emailToAssign.trim() || null` (already the prop name) to `assign.mutateAsync`.
- "Link to Partner" button disabled until `partnerId && emailToAssign.trim()`.

### 2. `src/lib/product-mapping.ts` — useAssignPartner

- Remove the `partner_contacts` upsert.
- Restore the `update partner set contact_email = fromAddress where partner_id = partnerId` step (only when `fromAddress` is non-empty).
- Keep the rest of the flow intact: email_log link, auto-match raw inputs against `product_mapping_learned`, send unmatched to PRODUCT_MATCH review queue, resolve the current PARTNER_UNKNOWN item with note `Partner assigned: {code/name}`.

### 3. No other changes

- `PRODUCT_MATCH` dialog already matches spec (raw vs suggested two-panel, searchable SKU select pre-selected on `suggested_value`, Potvrdi/Odbaci buttons calling `useConfirmMapping`/`useRejectMapping` which upsert `product_mapping_learned`, update `request_items.np_sku_id`, and resolve the review item). SKU label stays `np_sku_id — brand` per your choice.
- Hooks stay where they are (`product-mapping.ts` and `review-queue.ts`); no rename to `useAllNpSkus` / `useAllPartners` since callers already use `useNpSkuList` / `usePartners`.
- Generic `ResolveDialog` fallback for other categories is untouched.
- Partners page `ContactsSection` (added in a prior turn) stays — primary email lives on `partner.contact_email`, additional contacts in `partner_contacts`.

## Out of scope

- Schema changes — `product_mapping_learned`, `request_items`, `review_queue`, `partner`, `partner_contacts` tables assumed to already exist with the expected columns.
