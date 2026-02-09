# Nova UI Implementation

## Purpose

This document defines how to replace Nova's current barebones UI with a full production UI **without changing product behavior**.

This is an implementation guide for engineers/agents. It intentionally avoids visual design decisions (colors, spacing, typography, etc.).

## Scope and Non-Goals

- In scope:
    - Replace route/page markup with production UI components.
    - Preserve all existing route behavior, auth behavior, API contracts, and file/folder workflows.
    - Implement complete interaction model (click, keyboard, and context menu/right-click flows).
- Out of scope:
    - Backend API redesign.
    - URL/path changes.
    - Auth/session model changes.

## Hard Constraints (Do Not Break)

- Keep public route compatibility:
    - `/`
    - `/login`
    - `/folder/$folderId`
    - `/file/$fileId` (`$fileId` may include extension in route param)
    - `/profile`
    - `/admin`
    - `/tools`
- Keep intercepted modal route behavior:
    - Internal: `/folder/$folderId/file/$fileId/modal`
    - Masked URL: `/file/$fileId`
    - Refresh/direct on `/file/$fileId` must render full-page file view (not modal).
- Keep auth+CSRF flow:
    - Better Auth client for sign-in/sign-out/session.
    - CSRF from `/v1/csrf-token` and `x-csrf-token` header on protected mutations.
- Keep OG/bot handling:
    - `/file/$fileId` head tags and canonical behavior.
    - Bot middleware proxy for `/file/*` to backend file response.
- Keep existing query keys and invalidation semantics in TanStack Query.
- Keep API error handling shape surfaced from `ApiError`.

## Source of Truth (Current Architecture)

- Router/masks:
    - `apps/nova/src/router.tsx`
- Start middleware:
    - `apps/nova/src/start.ts`
    - `apps/nova/src/global-middleware.ts`
- Root route shell:
    - `apps/nova/src/routes/__root.tsx`
- Authenticated layout:
    - `apps/nova/src/routes/_authed.tsx`
- Feature APIs:
    - `apps/nova/src/features/auth/api.ts`
    - `apps/nova/src/features/folder/api.ts`
    - `apps/nova/src/features/files/api.ts`
    - `apps/nova/src/features/upload/api.ts`
- Query keys:
    - `apps/nova/src/lib/query-keys.ts`
- HTTP/CSRF/env:
    - `apps/nova/src/lib/http.ts`
    - `apps/nova/src/lib/csrf.ts`
    - `apps/nova/src/env.ts`
    - `apps/nova/src/lib/canonical.ts`

## UI Installation Plan (How to Replace Barebones UI Safely)

1. Preserve route modules; replace only presentation first.
    - Keep route files and loader/beforeLoad logic as-is.
    - Move large JSX blocks into UI components under `src/features/*/components`.
    - Keep route files as orchestration/container layers (data + handlers + navigation).

2. Introduce UI component layers (no behavior changes initially).
    - Add design-system primitives in a UI folder (buttons, inputs, dialogs, menus, tables/lists, toasts).
    - Wrap existing actions/handlers with new components.
    - Do not rename API functions or query keys.

3. Implement global UX infrastructure.
    - Replace inline status text with a consistent notification system.
    - Add loading/empty/error placeholders as reusable components.
    - Keep existing `getErrorMessage` output semantics.

4. Add context menus and keyboard interaction.
    - Implement right-click (desktop) and long-press fallback (touch) menus for folder/file items.
    - Use the exact function map in this document.
    - Ensure context actions call existing handlers or mapped APIs.

5. Keep modal interception exact.
    - File clicks in folder view must continue navigating to internal modal route with mask to `/file/$fileId`.
    - Modal close must still restore folder/history context.

6. Validate parity with test matrix in this document.
    - Run root checks:
        - `pnpm run typecheck`
        - `pnpm run lint`
        - `pnpm run prettier:write`

## Functional Inventory by Page

### `/` (Root Redirect)

- Check session.
- If authenticated, redirect to root folder.
- Else redirect to `/login`.

### `/login`

- Inputs:
    - `username`
    - `password`
- Submit:
    - Sign in with Better Auth.
    - Invalidate `["session"]`.
    - Reload session and route to:
        - sanitized `next` path if provided, else
        - `/folder/$rootFolderId`.
- Error state:
    - Show auth/validation/network error.

### Authenticated Shell (`/_authed`)

- Global top navigation links:
    - Files
    - Profile
    - Admin
    - Tools
- Show current username.
- Sign out:
    - call signOut
    - invalidate `["session"]`
    - navigate to `/login`.

### `/folder/$folderId` (Primary Work Surface)

- Data:
    - Folder details (`/v1/folders/:folderId`)
    - Folder contents (`/v1/folders/:folderId/children`)
- Breadcrumb:
    - Navigate to ancestor folders.
- Create folder:
    - `/v1/folders`
    - Refresh contents.
- Upload file:
    - `/v1/files` (multipart upload; `folderId` query)
    - Refresh contents.
- Folder listing actions:
    - Open folder.
    - Delete folder (`DELETE /v1/folders/:folderId`) with confirmation.
- File listing actions:
    - Open in modal intercepted route.
    - Open full-page file route.
    - Delete file (`DELETE /v1/files/:fileId`) with confirmation.
- Must render child `Outlet` for modal route overlay.

### Folder Item Context Menu (Right-Click / Long-Press)

Required actions:

- Open folder.
- Open in new tab (`/folder/$folderId`).
- Delete folder (empty only).
- Copy folder ID.
- Refresh current folder contents.

Optional/disabled stubs (show disabled with tooltip until API exists):

- Rename folder (no backend endpoint).
- Move folder (no backend endpoint).

### File Item Context Menu (Right-Click / Long-Press)

Required actions:

- Quick preview (open intercepted modal route with mask).
- Open full page (`/file/$fileId`).
- Open in new tab.
- Delete file.
- Copy file ID.
- Copy canonical file URL (`/file/$fileId`).

Optional/disabled stubs:

- Rename file (no backend endpoint).
- Move file (no backend endpoint).

### Folder Background Context Menu

Required actions:

- New Folder (focus create-folder flow).
- Upload File (open picker and submit existing upload flow).
- Refresh contents.

### `/folder/$folderId/file/$fileId/modal` (Intercepted Modal)

- Overlay modal on top of folder page.
- Fetch file details.
- Render preview pane.
- Close behaviors:
    - click backdrop
    - close button
    - Escape key (should be added if missing)
    - returns to previous folder/history context.

### `/file/$fileId` (Full Page File View)

- Loader fetches file details with optional `readToken`.
- Handles unauthorized/forbidden states without app crash.
- Shows file metadata.
- Delete action:
    - delete file then navigate to parent folder.
- Preview support:
    - images
    - videos
    - office files (`.docx`, etc., via Office embed)
    - unsupported fallback.
- Metadata:
    - `og:*`, `twitter:*`, canonical link.

### `/profile`

- Read-only user info from `/v1/users/me`.

### `/admin`

- Current auth info display.
- Create user (`/v1/users`).
- Create access rule (`/v1/access-rules`).
- List owned access rules (`/v1/access-rules`).

### `/tools`

- Create upload token (`/v1/upload-tokens`).
- Create read token (`/v1/files/:fileId/read-tokens`).
- Token-based upload utility (`/v1/files` with `uploadToken` form field).
- List owned upload tokens (`/v1/upload-tokens`).

### Root Error + Not Found

- Maintain dedicated error and not-found rendering paths from `__root.tsx`.
- New UI may style these, but must keep fallback behavior.

## API Mapping (UI Action -> Endpoint)

- Session/Auth:
    - `authClient.getSession`
    - `authClient.signIn.username`
    - `authClient.signOut`
    - `GET /v1/users/me`
    - `GET /v1/csrf-token`
- Folder:
    - `GET /v1/folders/:folderId`
    - `GET /v1/folders/:folderId/children`
    - `POST /v1/folders`
    - `DELETE /v1/folders/:folderId`
- Files:
    - `GET /v1/files/:fileId`
    - `GET /v1/files/:fileId/content`
    - `GET /v1/files/:fileId/thumbnail`
    - `PATCH /v1/files/:fileId`
    - `DELETE /v1/files/:fileId`
- Upload:
    - `POST /v1/files` (multipart upload)
- Admin/tools:
    - `POST /v1/users`
    - `POST /v1/access-rules`
    - `PATCH /v1/access-rules/:ruleId`
    - `GET /v1/access-rules`
    - `POST /v1/upload-tokens`
    - `PATCH /v1/upload-tokens/:tokenId`
    - `GET /v1/upload-tokens`
    - `POST /v1/files/:fileId/read-tokens`

## State and Cache Rules

- Keep these query keys:
    - `["session"]`
    - `["auth","info"]`
    - `["auth","access-rules"]`
    - `["auth","upload-tokens"]`
    - `["folder","details",folderId]`
    - `["folder","contents",folderId]`
    - `["file","details",fileId,readToken?]`
- Invalidate after successful mutations:
    - create/delete folder -> folder contents query.
    - upload/delete file -> folder contents query.
    - create access rule -> access rules query.
    - create upload token -> upload tokens query.
    - sign in/sign out -> session query.

## Accessibility and Input Requirements

- Every actionable row item must be keyboard reachable.
- Context menus must be operable via keyboard (ContextMenu key/Shift+F10 pattern).
- Modal must trap focus while open and close on Escape.
- Delete actions must have confirmation.
- Loading and error states must be announced/readable (ARIA-live recommended).

## Parity Test Checklist (Must Pass Before Merge)

- Auth:
    - unauthenticated access to authed route redirects to `/login?next=...`.
    - login returns to `next` when provided.
    - sign out returns to login.
- Folder/file behavior:
    - create folder, upload file, delete folder (empty), delete file.
    - list updates after each mutation without full page reload.
- Intercepted modal:
    - click file in folder -> modal overlay on folder context.
    - URL shown as `/file/$fileId`.
    - close returns to folder view.
    - reload `/file/$fileId` -> full page file route.
- File rendering:
    - image preview works.
    - video preview works.
    - office preview works for supported file types.
    - unsupported type fallback renders.
- Admin/tools:
    - all forms submit and show success/error.
    - access rule and upload token lists load.
- Metadata/bot:
    - `/file/$fileId` emits OG/twitter tags.
    - bot UA request to `/file/$fileId` returns proxied backend file response.

## Known Backend Gaps (UI Should Not Pretend These Exist Yet)

- No rename/move endpoints for folders/files currently.
- If design includes rename/move actions, ship as disabled or hide behind feature flags until backend endpoints are added.

## Definition of Done for UI Replacement

- Barebones route JSX replaced by production UI components.
- All functions listed above available and working.
- No regressions in route masking, auth redirects, CSRF, OG/bot behavior.
- `pnpm run typecheck`, `pnpm run lint`, and `pnpm run prettier:write` pass at repo root.
