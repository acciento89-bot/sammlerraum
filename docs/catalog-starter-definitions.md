# Explicit catalog starter definitions

An empty installation supports personal items and authored grading immediately. An operator may explicitly install two modest authored category templates and their condition schemes. The application never invokes this command during startup, deployment or ordinary user requests.

Run this source-checkout command from an installed repository checkout with its Prisma client generated and all migrations applied to the intended database. Use the pinned Node 24.19.0 runtime and pnpm 10.17.1 package manager; set `DATABASE_URL` to that database. The current worker container does not include this maintenance command. Container packaging and an in-image invocation remain a Phase 13 gate.

Build the existing worker maintenance command and inspect the dry-run:

```sh
pnpm --filter @sammlerraum/worker build
pnpm --filter @sammlerraum/worker catalog:init
```

Apply deliberately:

```sh
pnpm --filter @sammlerraum/worker catalog:init --apply
```

Use the repository's pinned pnpm10.17.1. The command uses the existing Node runtime, PostgreSQL connection and maintenance services. It does not create catalog entries, accounts, application role grants, collections, sample items, provider records or external requests. It prints category keys and intended actions, never connection credentials.

The authored DE/EN starter set is:

| Category | Optional short-text fields | Exact condition labels |
| --- | --- | --- |
| Sammelkarten / Trading cards (`trading_cards`) | Set, Sammlernummer / Collector number | Mint, Near Mint, Excellent, Good, Played, Poor |
| Schallplatten / Vinyl records (`vinyl`) | Interpret / Artist, Label, Katalognummer / Catalogue number | M, NM, VG+, VG, G, F, P |

These are application starter choices, not a claim of professional certification. Every starter normalized band is null. A later band policy requires new immutable option keys and retirement of superseded choices; it cannot rewrite the meaning of selected existing options. Personal condition and external grading remain separate.

## Atomicity and reruns

The dry-run and apply each acquire one namespaced transaction advisory lock. Apply performs semantic preflight for the complete manifest before any creation, then reuses the category and condition maintenance services under that same transaction. All writes commit together or roll back together. The condition service receives a typed adapter for the already active transaction; it does not open nested transactions or duplicate persistence logic.

A missing complete category is created with its definitions and scheme. A matching existing category with no scheme receives its whole starter scheme. An existing malformed partial category or scheme fails rather than guessing repairs. Existing starter keys must match labels, types, scope, positions, options and null bands. Any seed-key conflict fails clearly before writes. Category definitions and condition options appended after the original starter content are retained. Inactive schemes/options remain inactive. Existing identities are never replaced, deleted or reactivated.

Operator maintenance should append new option identities and retire old options for semantic corrections. Keep the original seed identities so reruns can distinguish deliberate retirement from an incompatible installation. A conflicting local customization must be resolved deliberately outside this initializer; there is no overwrite/force mode.

After initialization, ordinary users can propose authored reference entries in the catalog. A separately granted application moderator can review those proposals. Role management remains the operator process documented in `catalog-moderation-operations.md`.
