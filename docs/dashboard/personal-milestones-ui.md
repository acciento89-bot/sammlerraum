# Private personal milestones: collector UI

The dashboard shows a separate, read-only preview of up to five owner-authored milestones. Inventory filters, lifecycle selections and inventory read errors do not filter this preview. Its scope and read time are explicit; it does not share a transaction snapshot with inventory metrics.

`/{locale}/milestones` is a fresh-authenticated, actor-keyed management page. It uses the private milestone HTTP operations documented in `personal-milestones-wire.md`. The list holds one page of twenty records and exposes First, Next and Refresh, without accumulating all records or a cursor-history cache. Each page is a new database snapshot; an edited date can move a record between pages.

## Editing and recovery

Titles render as plain text. Dates are Gregorian date-only values, from `0001-01-01` to `9999-12-31`, including future dates. They are labelled as owner-entered dates, not verified achievements. Server recording and editing instants are shown separately with UTC millisecond precision. No title, date or definition is put into browser URLs or persistent browser storage.

Edits use the complete fetched identity and revision. Same-value updates still advance the revision. Deletion requires a separate confirmation and is permanent. Unsaved, pending and uncertain writes use the existing single navigation guard; a pending write cannot be abandoned. A fresh list is required before selecting another existing record from an invalidated list.

A successful acknowledgement remains acknowledged even if the following list read fails. Network loss, server uncertainty and malformed or mismatched successful acknowledgements retain the submitted context and disable replay. The client never automatically retries a mutation. In particular, matching title/date values cannot establish whether an uncertain creation succeeded.

The user may inspect a fresh bounded list after conflict or uncertainty. A record absent from the inspected page is described as absent from that page, not deleted. Adopting an inspected current revision is a deliberate action protected by the discard confirmation. Paging does not silently discard the existing draft. Refresh/inspection generations reject older responses; beginning a write invalidates and cancels pre-write reads.

An actual unauthorized response closes the old component's read and write channels and clears its private list, editor, receipt, modal and deferred focus. Later responses, retry and browser history cannot reopen that expired scope. A normal fresh authenticated page load keys the UI to the new actor; this is not a new cross-tab identity synchronization framework.

## Boundaries

The implementation reuses `searchRequest`, `RequestChannel`, `DeferredFocus`, `useCollectorConfirmation` and existing dialog keyboard handling. The milestone client applies the 64 KiB response bound and validates acknowledgements against the submitted identity, revision and canonical values. Other search callers retain their original response bound.

Localized browser tests exercise real authenticated Next routes and PostgreSQL writes; deliberate transport interception is confined to fault/race scenarios. Desktop/mobile Chromium profiles, CSS zoom and narrow viewport checks are browser evidence, not physical Safari, iPhone or Duo evidence. Personal milestones do not add valuation, market rights, money interpretation, sharing, relations, automatic goals or portfolio history features.
