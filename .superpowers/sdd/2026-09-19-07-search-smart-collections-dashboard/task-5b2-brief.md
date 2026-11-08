# Task5B2 — bounded search references and catalog picker modes

Preparation only. Source GO requires reviewed B1 and root-supplied fresh BASE; reconcile its real exports before implementation. This completes the second half of B transport prerequisites, not original Task5/Phase07/count.

## Binding constraints

- Filter definitions are structured, versioned data, not arbitrary SQL or free-form query strings.
- Search never returns items the actor cannot view.
- Smart Collections contain no duplicated item rows.
- Large/complex filters have bounded depth and clause count.
- Dashboard values remain separated by currency/source where aggregation is unsafe.

Read task-5b-context.md P7.29–33 and complete task-5b-contract-preparation.md sections1,3–9 for exact DTOs, caps, SQL semantics and proof matrix. These are requirements, not suggestions after explicit GO; B1 private query behavior remains binding regression coverage. No frontend, new filter producer, provider/rights activation, schema/index or maintenance change.

## Deliverable boundary

Three reference families only, each actual GET/POST `/api/v1/search/references/{collections,custom-fields,conditions}`, using real source-native owner/canonical metadata and exact DTOs in preparation§5. Add browser-safe strict contracts/package subpath; focused domain reference service/set SQL and tiny ID-only cursor; web dependency/routes and three route modules; extend B1 fixed body reader only with the three actual closed array/tuple shapes. No generic metadata/JSON/auth/error framework.

Every owner join checks live owned parent; foreign public/private, deleted and missing resolve identically200 UNAVAILABLE/null. Malformed syntactic IDs400; inaccessible browse parent generic422; real empty owned parent/no-scheme canonical category is a successful empty result. Lists ID_ASC,20default/50max/no total. Hydration1..50 unique normalized IDs/pairs and input order. Custom SUMMARY1..50; OPTIONS1..2 definitions with position,id ordered authored options≤100/101sentinel; nonselect empty versus corrupt select distinct, no truncation/no usage/item values. Condition GET and resolve retain inactive schemes/options with real active flags; `[categoryId,null]` resolves category label without a fourth family, nonnull mismatch gets unavailable with allpayloadnull.

GET strict raw encoded query≤32768bytes, exact fixed keys/duplicate and malformed UTF8/percent rejection. Existing search decoder drops custom parent keys, so factor a narrow actual decoded-map seam or fixed reference decoder without widening existing search input. POST body-only, fresh session, exact Origin,32KiB streamed/fatalUTF8/BOM/root-keyduplicate guard using reviewed B1 semantics. Arrays limited to one depth for collection IDs/two for reference tuples; no nested objects. Errors and no-store/requestId follow preparation§8. No sensitive query/body/labels in logs/errors.

Dedicated canonical ID-only cursor `{v:1,contextHash:64lowerhex,after:lowerUUID}` fixed-order canonicalUTF8JSON/unpaddedbase64url,≤2048encoded/1536decoded, strict keys/fatalUTF8/re-encode equality. SHA256orderedtuple `['search-references',1,actorId,family,parentIdOrNull,'ID_ASC',limit]`. No dummycreatedAt, no relaxing search/saved cursor. Assess actual duplication; use narrow primitive if substantial sharedmechanics, no allcursorframework.

Existing bounded RepeatableRead wrapper, immutable sessionactor, ItemSearchError closed mapping; do not add unrecognized error classes. Lists/metadata hydration1datastatement (3wrappercalls including settings), customOPTIONS2data (5wrappercalls), plusauth/driveroverhead; readAt from firstSQLclock including emptyparentmarker. VALUESordinality/ownerLEFTjoins and exact chosen101option sentinels; no per-IDappquery/count/inventory extraction. Pretransfer guard malformed/overlongnativeTEXT with invalid marker and strict realproducerDTO checks, resource503 versus invariant500. Finalresponse≤1MiB/12sbudget; validation/serialization/postsettlementchecks, no partialsuccess.

Include two finite modes on existing authenticated GET `/api/v1/categories/[id]`: `?view=definitions` complete≤100 metadata only, no options; `?view=definition&definitionId=...` exactone with≤100options/101sentinel. Exact oneboundedsetread/newmode (3wrappercalls), strictquery/1MiB/generic422 errors, actual canonical keys/DEENlabels and schemas. No alloptionsfetchthenJSslice. Preserve omitted-view/default oldcallers/errors. This fixes the existing legitimate100definitions×100options transfer gap for an active picker; canonical metadata has no activecolumn. Add narrow dependency methods described in preparation§7A, no fourthfamily.

AST50leaves is not50referenceIDs. Contract fixture with valid>50totalIDs acrossmultipleleaves under16KiB/512 demonstrates lossless draft separate from bounded labelhydration. Hydrate activeleaf/current≤50resultpage, not entireAST eagerly. Valid custom identity absent from option suggestions stays valid no-match; missing definition is a different unavailable state. No frontend/cache implementation here; export fixture/contract evidence for5C.

## Proof/report

Meaningful actual native RED before implementation: real two-owner/deleted/missing labels and retained inactive condition produce required closed states; do not use missing-module startup as sole behavioral RED. Run exact finite proofmatrix preparation§9 as applies to B2: list0/1/20/50/51 and exhaustedpaging; cursor actor/family/parent/limit replay/noncanonical; inputorder/uppercasealiases/duplicatecaps; SUMMARY50/OPTIONS2 versus3,100/101options; categoryonly/missing/mismatch/inactive/noscheme; nativecorruptlabels/output/responsecap; MVCCconcurrentmetadata+options; installedtimeout/retry; actual1/50referencequerycounts/settings, EXPLAIN ANALYZE/BUFFERS and no speculativeindex. Valid100×100category proves all100definitionchoices and bounded singledefinitionmode, defaultbehaviorunchanged. Nativeconstraintsstayenabled; impossiblecorruption uses precise boundaryfixtures honestly labelled.

Preserve B1GET/POST/rawf/auth/cursor and existing saved/catalog/condition regressions for actual sharedtouches. Add actual newnativefiles toCI allowlist. Sole source/DB/suite owner afterGO, pinned Node24.19.0/pnpm10.17.1, guarded sammlerraum_test through ../sammlerraum-test-env.sh. Final relevantnative/regular/types/lint/build once onfrozen source; repeat only justified affectedgates.

Write task-5b2-report.md with behavioralRED/GREEN, exactcommands/output/logs, nativeversuspurecounts/skips, actualqueries/plans/caps andcostlimits, frozenSHA/source+separateevidencecommits, unchangedcompatibility and remainingUI/producer/fullPhase07gates. Stage only ownsource/report/logs, no push/rootledger/checkoff/subagents. Root independentSPEC+QUALITY review andexactCI follow. Do not activate producerfamilies because labelroutes orparseracceptthem.
