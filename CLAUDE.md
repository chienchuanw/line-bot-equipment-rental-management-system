# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

A LINE Bot for managing camera/lighting equipment rentals, built on Google Apps Script (GAS) with Google Sheets as the datastore. Users interact entirely through Traditional Chinese LINE text commands; there is no UI. Code comments, docs, and test descriptions are written in Traditional Chinese — match that when editing.

## Commands

```bash
pnpm test                      # run all tests (jest)
pnpm test:unit                 # unit tests only
pnpm test:watch                # watch mode
pnpm test -- tests/unit/dateUtils.test.js        # single test file
pnpm test -- -t "解析點分隔的日期"                 # single test by name (Chinese test names)
```

Deployment goes through [clasp](https://github.com/google/clasp) (`.clasp.json` pins `scriptId` and `rootDir: src`):

```bash
clasp push                     # push src/ to the Apps Script project
clasp show-file-status         # check local vs remote diff
clasp tail-logs                # view execution logs
clasp open-script              # open the web editor
```

`clasp push` only uploads code. Creating a new **deployment version** (which is what the LINE webhook actually hits) is a manual step in the Apps Script editor — pushing alone does not make changes live.

### Scripts that are currently broken

Don't trust these three; they fail for environmental reasons, not because of your changes:

- `pnpm lint` — ESLint is listed as a devDependency but there is no `eslint.config.js`/`.eslintrc`, so it errors out immediately.
- `pnpm test:integration` — `tests/integration/` doesn't exist; jest exits 1 with "No tests found".
- `pnpm test:coverage` — always fails the 60% threshold in `jest.config.js`, reporting 0% across all of `src/`. See "Tests don't import src" below.

## Architecture

### Everything is a global — no module system

GAS concatenates every file in `src/` into **one shared global scope** at runtime. There are no `require`/`import`/`export` statements anywhere in `src/`, and adding them would break the deployed bot. Consequences to keep in mind:

- Any function in any `src/*.js` file can call any function in any other file directly. `main.js` calls `handleBorrowForm_` (borrowService) and `replyMessage_` (lineService) with no import.
- **Function names are globally unique across the whole `src/` directory.** A new helper named `formatDate_` in two files is a silent redefinition, not a scoping error.
- Constants in `config.js` (`SHEET_LOANS`, `LOANS_HEADERS`, `SHEET_USERS`, `USERS_HEADERS`, `UNKNOWN_CMD_MSG`, `LINE_API_BASE_URL`) are plain globals available everywhere.
- The trailing-underscore suffix (`handleEvent_`, `parseDotDate_`) is the GAS convention marking a function as private — it hides it from the Apps Script editor's "Run" dropdown. `doGet`/`doPost` have no underscore precisely because GAS must expose them as web entry points.
- The `.js` extension is local convenience only; clasp uploads them as `.gs`. The README still refers to them as `.gs` files.

### Request flow

`doPost` (main.js) is the LINE webhook entry point. It calls `ensureLoansHeaders_()` on **every** request (self-healing: creates the `loans` sheet and header row if missing, and appends any newly-added header columns), verifies the signature, then fans each event out to `handleEvent_`. Because it runs on every request, anything that function does to the sheet happens in production the instant you deploy — see "Data model" below.

`handleEvent_` is the single command router — **all command dispatch lives here**, matching regexes against the message text. Adding a command means adding a branch here plus a handler in the relevant service:

| Command | Handler | Notes |
| --- | --- | --- |
| `借器材` + 3 lines | `handleBorrowForm_` (borrowService) | matched against **raw** text before whitespace stripping, since the form is newline-delimited |
| `查器材 YYYY.MM.DD` | `replyBorrowedOnDate_` (queryService) | |
| `查器材 YYYY.MM` | `replyBorrowedOnMonth_` (queryService) | |
| `我的租借` | `replyMyBorrowRecords_` (queryService) | lists the user's active/future records with `[n]` indices |
| `刪除 <n>` | `handleDeleteRecord_` (deleteService) | `n` indexes into the `我的租借` listing, **not** the sheet |
| anything else | replies `UNKNOWN_CMD_MSG` | |

Every non-`借器材` command is normalized with `rawText.replace(/\s+/g, '')` before matching, so the routing regexes contain no spaces (`/^查器材(\d{4}\.\d{2}\.\d{2})$/`). This is what lets users type `查器材 2025.09.11` or `查器材2025.09.11` interchangeably.

`verifyLineSignature_` **always returns true**. GAS can't read HTTP headers, so it computes the HMAC but never compares it. This is a known, deliberate limitation — not a bug to "fix" without changing the hosting model.

### Layers

- `main.js` — webhook entry (`doGet`/`doPost`) and the command router.
- `config.js` — constants and `getProp_` (reads Script Properties).
- `sheetService.js` — all Sheets I/O. Nothing else touches `SpreadsheetApp`.
- `lineService.js` — all LINE API calls. Nothing else touches `UrlFetchApp`.
- `calendarService.js` — all Google Calendar I/O. Nothing else touches `CalendarApp`.
- `borrowService.js` / `queryService.js` / `deleteService.js` — business logic.
- `dateUtils.js` — pure date helpers, the only fully side-effect-free module.
- `userService.js` — `resolveDisplayName_`, also pure. Reads no sheets; the caller passes in the map.
- `testDebug.js` — legacy manual debug harness, excluded from coverage. Not part of the app.

### Data model

The main sheet is `loans`, with a fixed column order defined by `LOANS_HEADERS` in `config.js`:

`ts | userId | username | items | borrowedAt | returnedAt | eventId`

`borrowService.js` writes rows via positional `appendRow([...])`, so **reordering `LOANS_HEADERS` alone would silently corrupt writes** — the array literal must change with it. Reads are safe: `getLoanRows_` locates columns via `header.indexOf`, not position.

`ensureLoansHeaders_` is **additive**. It has three branches:

- Empty sheet → write the full header.
- Existing header is a *prefix* of `LOANS_HEADERS` → append only the missing header cells, leaving data untouched.
- Header genuinely doesn't match (non-prefix) → `console.error` + throw. It never clears.

So appending a column to `LOANS_HEADERS` is a safe operation and deploy order doesn't matter. **Always append to the tail** — inserting in the middle reads as a non-prefix and throws. (An earlier version called `sheet.clear()` on any mismatch, which meant adding a column would wipe the production sheet on the next request. Don't reintroduce that.)

A second sheet, `users` (`userId | displayName`), maps LINE user IDs to human-readable names. It is deliberately **not** self-healing: if the sheet is missing, `getUserDisplayNameMap_` returns `{}` and every name falls back to the LINE nickname. This sheet breaking should never take the bot down.

Names resolve at **display time** (calendar event titles, `查器材` replies), never at write time — so editing the `users` sheet re-labels existing records too, and the `username` column keeps the original LINE nickname snapshot from the moment of borrowing. `我的租借` and the borrow confirmation deliberately skip the map: those are the user looking at their own screen, where their own nickname reads more naturally.

Naming trap: the user-facing field 租用日期 ("rental date") maps to `borrowedAt`, and 歸還日期 ("return date") maps to `returnedAt`. The source comments call this mapping out repeatedly because it's easy to invert.

Queries treat a record as occupying a date when `borrowedAt <= target <= returnedAt` (inclusive on both ends); month queries match any record *overlapping* the month.

### Delete semantics

`刪除 <n>` is not a plain delete. `handleDeleteRecord_` branches on the record's dates:

- **Future record** (`borrowedAt > today`) → the row is physically deleted (`loans.deleteRow`).
- **In-progress record** (`borrowedAt <= today <= returnedAt`) → the row is kept and `returnedAt` is set to today, i.e. an early return.
- **Expired record** → never listed, so never operable.

Users can only ever act on their own records (`userId` comparison). `sheetRowIndex` is computed as `arrayIndex + 2` to account for the header row and 1-based sheet rows.

### Calendar sync

A successful booking creates an all-day event spanning the rental. Deleting a future record deletes the event; an early return *shortens* it rather than deleting, because the gear genuinely was out.

Three constraints that are easy to get wrong:

- **All-day event ends are exclusive.** A 9/11–9/13 rental must pass `end = 9/14`. That `+1` lives in `addDays_` (`dateUtils.js`) so it stays testable; don't inline bare `+1`s.
- **Order of operations in `handleBorrowForm_` and `handleDeleteRecord_`: write → reply → touch the calendar.** The calendar calls sit *outside* any `try`/`catch` and *after* `replyMessage_`. This is deliberate. `loans` is the source of truth and the calendar is only a mirror, so a calendar outage must not block a booking. Letting the exception propagate is what makes Apps Script email the script owner; the user sees the normal success reply and never learns the calendar exists. Wrapping these calls in a `try`/`catch` would tell the user "處理記錄時發生錯誤" *after* their record was already deleted, and they'd retry.
- **`eventId` must be read before `loans.deleteRow`** — the row is gone afterwards.

`eventId` is empty for records predating this feature and for any whose sync failed. Empty `eventId`, or an event someone deleted by hand, means the calendar step silently no-ops — a missing event must never block a user from deleting their own record.

## Testing

### Tests don't import src — they copy it

This is the single most important thing to know about this repo. Test files **paste a duplicate of the function under test into the test file itself** and exercise that copy. `tests/unit/dateUtils.test.js` says so outright ("從 src/dateUtils.js 複製"), and `main.test.js` redefines `doGet`, `doPost`, and `handleEvent_` inline. Nothing in `tests/` reads `src/`.

This is a workaround for the no-module-system constraint, and it has a hard consequence: **the 284 passing tests do not test the deployed code.** They test copies that can drift silently. Coverage reports 0% because `src/` is genuinely never loaded.

So when you change a function in `src/`, a green test run means nothing on its own. You must **also update the copied version in the corresponding test file**, or the tests will keep asserting against the old behavior forever. Treat any change to `src/` as incomplete until the mirror in `tests/unit/` matches.

This is not hypothetical. `toDateOrNull_`'s copy in `dateUtils.test.js` has already drifted: it special-cases `0` as a valid Unix epoch, while `src/dateUtils.js` uses `if (!v) return null` and returns `null` for `0`. There is a green test asserting the copy's behavior — the opposite of what ships. Low practical impact (date cells are never `0`), but it is proof that green means nothing here.

A corollary: **red-green TDD is structurally impossible in this repo.** The copy *is* the implementation under test, so a test written against a new copy passes immediately and never goes red. The workable substitute is: confirm via `grep`/`ls` that `src/` lacks the function, write the test + copy, then transcribe the copy verbatim into `src/` and diff the two.

If you're improving the test setup, loading `src/` via `fs.readFileSync` + `vm`/`eval` into the global scope is the standard fix for GAS projects, would make coverage real, and would make TDD possible.

### Mocks

`tests/mocks/testHelpers.js` is the entry point: `setupTestEnvironment({ loanRecords, properties, userProfiles, userRows, calendarId, calendarEvents })` installs fake `SpreadsheetApp`, `PropertiesService`, `UrlFetchApp`, and `CalendarApp` onto `global`, mirroring how GAS provides them. `tests/setup.js` (jest `setupFilesAfterEach`) resets those globals to `undefined` and provides `global.testHelpers`. Since GAS services are globals, tests configure them by assigning to `global.*` rather than by injection.

Two options model absence rather than emptiness, matching production defaults: omitting `userRows` means the `users` sheet **doesn't exist** (`getSheetByName` returns `null`), and omitting `calendarId` means **no calendar is reachable**. Pass them only when the test is about the feature being on.

## Configuration

Secrets live in Apps Script **Script Properties**, not in files — `getProp_('LINE_CHANNEL_TOKEN')` reads them at runtime. `LINE_CHANNEL_TOKEN` is required; `LINE_CHANNEL_SECRET` is optional and currently unused for real verification. The `.env*` files at the repo root are gitignored templates for local reference only; GAS never reads them.

`CALENDAR_ID` (optional) is the target Google Calendar. **Unset means calendar sync is off** — every calendar call silently no-ops, and the rest of the bot behaves exactly as before. Set-but-unresolvable *throws*, on purpose: if both cases returned `null`, a typo'd ID would masquerade as "feature not enabled" and nobody would notice the calendar staying blank.

The calendar must be shared with the script owner's account with "Make changes to events". GAS always runs as the deployer (`executeAs: USER_DEPLOYING`), so there is no way to act as a different Google account without OAuth2 + a stored refresh token, or a service account with domain-wide delegation (Workspace only). Sharing the calendar is what avoids all of that.

Adding `CalendarApp` introduced a **new OAuth scope**. A web app runs against the authorization captured at deploy time, so after any scope change you must re-authorize in the Apps Script editor *and* create a new deployment version — otherwise `doPost` fails outright and the whole bot goes down, not just the calendar. See `docs/deployment-calendar-sync.md`.

`src/appsscript.json` must stay in `src/` (clasp requires the manifest inside `rootDir`). It sets the timezone to `Asia/Taipei` and the webapp to `ANYONE_ANONYMOUS` — both required for LINE to reach the webhook.
