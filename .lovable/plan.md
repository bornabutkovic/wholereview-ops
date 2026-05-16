## Novo Pharma Ops Dashboard — Build Plan

### Stack & setup
- TanStack Start (existing), React + TS, shadcn/ui, TanStack Query, Tailwind
- Connect to the provided external Supabase project (not Lovable Cloud) via `@supabase/supabase-js` browser client using the given URL + anon key
- Install: `@supabase/supabase-js`, `date-fns`
- Add Inter font via Google Fonts link in `__root.tsx` head

### Supabase client
- `src/lib/supabase.ts` — `createClient(url, anonKey)` with `persistSession: true`, `autoRefreshToken: true`, localStorage storage
- `src/lib/types.ts` — TS types for `review_queue` row + enums (`ReviewCategory`, `ReviewStatus`)

### Auth
- `src/hooks/useAuth.tsx` — context provider wrapping `onAuthStateChange` + `getSession`; exposes `user`, `loading`, `signIn`, `signOut`
- Wrap `<Outlet />` in `__root.tsx` with `AuthProvider` + `QueryClientProvider`
- `src/routes/login.tsx` — email/password form, calls `supabase.auth.signInWithPassword`, redirects to `/` on success
- `src/routes/_authenticated.tsx` — pathless layout; in component, if `loading` → spinner, if no user → `<Navigate to="/login" />`, else render sidebar shell + `<Outlet />`
  - Note: using component-level guard (not `beforeLoad`) because auth state lives in browser context, not router context — acceptable for SPA-style internal tool
- Move all app pages under `_authenticated/`

### Layout & sidebar
- `src/components/app-sidebar.tsx` — dark slate-900 sidebar, Inter, compact, blue-500 accent for active item, lucide icons
  - Items: Dashboard, Requests, Review Queue, Stock, Prices, Partners, Analytics
  - User email + sign-out at bottom
- Use shadcn `sidebar` primitive with custom dark theming

### Routes (all under `_authenticated/`)
- `index.tsx` → Dashboard (placeholder)
- `requests.tsx`, `stock.tsx`, `prices.tsx`, `partners.tsx`, `analytics.tsx` → shared `<ComingSoon title="..." />` component
- `review-queue.tsx` → full implementation

### Review Queue (functional)
**Data layer** — `src/lib/review-queue.ts`:
- `listReviewItems({ status, category })` → select with filters, order by `created_at desc`
- `resolveReviewItem({ id, status, note, userEmail })` → update row

**Page** — `src/routes/_authenticated/review-queue.tsx`:
- Header: title + count
- Toolbar: status `Select` (default OPEN; All/OPEN/RESOLVED/DISMISSED), category `Select` (All + 6 enum values), search `Input` (client-side filter on description)
- `useQuery(['review-queue', status, category], ...)`
- Table (shadcn): Category badge (color per enum), Description (truncated w/ tooltip), Status badge, Created at (relative via `formatDistanceToNow`), Actions (Resolve button)
- States: skeleton rows while loading, empty state ("No items match"), error alert with retry
- **Resolve modal** (`Dialog`): shows item summary, required `Textarea` for resolution note, two buttons: "Mark Resolved" (primary blue) and "Dismiss" (secondary)
  - Disabled until note non-empty
  - `useMutation` → update Supabase with `status`, `resolution_note`, `resolved_at: new Date().toISOString()`, `resolved_by: user.email`
  - On success: invalidate query, close modal, toast
- Badge color map:
  - PRODUCT_MATCH: blue, QTY_AMBIGUOUS: amber, PARTNER_UNKNOWN: purple, DOC_TYPE: cyan, PRICE: rose, OTHER: slate
  - OPEN: blue outline, RESOLVED: green, DISMISSED: slate

### Design tokens
- Update `src/styles.css`: keep light base, set `--primary` to blue-500 oklch equivalent, add sidebar dark tokens
- Apply Inter via `font-family` on body

### Notes
- Anon key is publishable — safe in client bundle, no secret tool needed
- All Supabase calls are client-side via the browser client; no server functions required for this scope
- RLS on `review_queue` must allow authenticated users to select/update — assumed already configured on the user's existing project
