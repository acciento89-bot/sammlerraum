# Phase08 Task2 — bounded CSV/XLSX parser worker

Root source GO after Task1 local acceptance: sourcec4938aaaec6ad773501f0972861bd9b5fa67ee14, evidence426b2f16ce3d80b8876687306655667191812ee2. All827native/1475regular/types/lint/build/22inventory-browser gates passed; whole review's one P2 is independently closed. Task1's exact remote runs42286107177/42286097492 are pending. Local Task2 work may proceed; hold dependent publication until both pass and stop affected work on a real failure. User authorization is continuous until stopped. Root is sole implementer/runtime owner; no production, main application merge, provider, real data or emulator action.

Follow approved Phase08 plan Task2 and spec§17. Implement the actual parser worker and persisted parsed rows, not only a pure reader. Upload/API/UI remain later tasks; actual inventory commits are Task3. Needed narrow storage/repository/model/worker-registration integration is included in this GO. Do not create a second import architecture or change M7 monetary meaning.

## Verified dependencies and reader shape

Public npm metadata verified2026-11-06: csv-parse7.0.3(MIT), yauzl3.4.0(MIT,Node>=12), saxes6.0.0(ISC,Node>=12.22.7). Pin exact versions; verify the type package separately. Use CSV's stream API, yauzl's fromBuffer/lazyEntries/strictFileNames/size validation, and SAX XML parsing. No Excel formula engine, floating-point money conversion or external document fetch.

The current StorageProvider.read reads an entire object without a bound. Add a compatible bounded-read option to the real local provider before trusting a20MiB metadata declaration. Actual bytes must be bounded during read and checked against declared length/SHA-256; parse that same private verified buffer. This avoids path/verification races. Existing key and symlink protections remain. Default callers retain compatibility; test the real bounded local read. Do not modify source files or keys while parsing.

`parseImportSource(bytes,options,limits,onHeader?)` is an async row iterator. Rows carry a logical data ordinal, original record/worksheet row number, and string/null cells. An optional header callback only captures bounded header metadata. Persist original source addresses with an additive nullable field if needed; do not reinterpret existing logical row keys. Header/delimiter/sheet settings must be explicit and pinned under a versioned parser contract. No new profile meaning after a retry.

## Bounds and semantics

Keep Task1 hard ceilings:20MiB source bytes,10,000 data records,256 cells/row,16KiB UTF-8 per cell and64KiB compact row JSON. Count scanned records too so empty-record floods cannot bypass work limits. Add bounded decoded ZIP/XML budgets (proposed64MiB total,16MiB per XML part,2,048entries,100,000shared strings, depth64). Limits may be lowered by validated server config, never silently raised beyond database/contracts. Reject instead of truncating or allocating from untrusted sheet dimensions. Sparse coordinates do not cause dense arrays.

CSV uses fatal UTF-8 decoding, explicit comma/semicolon/tab delimiter, quote-aware records and preserved strings. Header handling is explicit. XLSX reads cached values only, preserves numeric XML lexemes rather than converting through Number, and ignores cell display styles for money/date interpretation. Unsupported lexical forms remain row validation errors later. Reject macro-enabled/encrypted workbooks, invalid archive paths, DTD/entity declarations and malformed references. Never fetch external relationships; only validated internal workbook/sheet/shared-string parts are consumed. Reject ambiguous/missing selected sheets or shared-string indices. Bound every stream and close/destroy owned readers on failure.

## Actual producer integration

Use existing worker/queue lifecycle patterns. Payload contains only job ID; owner, collection, key and hash come from current private database state. Add only the lease/token/attempt/parser-options/header/source-address fields actually needed by this producer. A claim may verify an uploaded object while status is still AWAITING_UPLOAD; only verified bytes can advance to PARSING. Real source verification is required before any row is accepted. The handler consumes an uploaded object; it does not claim to implement the later HTTP uploader.

Persist batches of at most100 rows with stable job/row keys. Retrying the same bytes/options must validate already-written rows rather than rewrite or duplicate them. Mark PARSED only after the entire source passes limits and the persisted row count agrees. Late failures leave a closed FAILED/not-previewable job, not a partial successful import. No inventory writes. Current claim token fences renew/append/finish/fail; lost claims cannot mutate state. Heartbeat/abort lifecycle must retain authority until actual work settles, including ignored cancellation, following the existing market/image patterns.

Register the real worker handler; source-upload API/cleanup/dispatch obligations must be named explicitly if they belong to later Task7. Source cleanup must not delete active input, and must be completed before upload endpoints are exposed. No real files/accounts are used in validation.

## Required evidence

Start with real RED tests for row limits and stored formula values. Use independent small OOXML ZIP fixtures, including macro/path/DTD/size/encoding/shared-string failures; no formulas/macros execute. Prove CSV quoting/Unicode chunks, byte/row boundaries, numeric lexical preservation and no style-based scale guesses. Use actual local storage and PostgreSQL for checksum/claim/batch/retry/cancellation/late-failure behavior, not only mocks. Root owns serial native/browser runtime, one whole completed-candidate review, final gates, honest counts and feature-branch publication. Task2 alone does not complete the import UI or inventory commit.

Primary references: https://csv.js.org/parse/options/max_record_size/ (character limit, so UTF-8 byte limits remain separate); https://github.com/thejoshwolfe/yauzl (lazy entries, fromBuffer, entry-size validation); https://github.com/lddubeau/saxes (streaming XML and explicit DTD/entity policy). Read pinned installed documentation/source before using version-specific APIs.

## Parser implementation and dependency correction

Task1 original PR CI failed due an old browser response/navigation race; Task2 source was safely held and resumed only after the test-only closure passed176browser cases plus30repeat cases, web types/format and independent scoped review. Corrected published Task1 head0611d35007e73c3d1da2928825dd433763ba01d3 now runs42290468889/42290457197; dependent publication still waits for both successes. Original426 push passed; its PR failure remains retained.

Task2 uses exact pinned csv-parse7.0.3(MIT),yauzl3.4.0(MIT),saxes6.0.0(ISC),@types/yauzl3.4.0(MIT),zod4.1.11(existing shared version). ExcelJS from the illustrative plan stack is replaced by a bounded ZIP/SAX cached-value reader: no formula engine, less unbounded workbook allocation. XLSX part16MiB,total declared decoded64MiB,2048entries,100000shared strings,64XMLdepth; actual consumed entry size/CRC checked. UTF-8 only; unsupported or ambiguous workbooks close with a controlled error, not guessed data. No external relationship may be fetched or accepted. CSV max_record_size is characters, supplemented by exact UTF-8 raw-row/cell byte guards.

The new additive parser-claim migration records explicit pinned parser options, source row addresses, header and fencing lease/token/attempts. Existing source/row identity and receipt triggers remain unchanged; new triggers add header/options/address protection. No deployed migration is edited. The real handler is registered before worker queue lock, accepts only jobId, verifies actual bounded storage bytes+SHA, validates retry prefixes, persists100rows/transaction and finishes only after full membership validation. HTTP upload/dispatch/source retention remain Task7 obligations before routes are exposed; no inventory commit is claimed. Root froze whole candidatef90e6d4 for independent review.
