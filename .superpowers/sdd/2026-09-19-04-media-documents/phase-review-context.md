# Phase04 final review context (finalize after Task6)

Review whole approved six-task implementation from Phase03 completion7171142754c89c7a9eb3d9c20cb7bf3631fab2e1 to finalPhase04head. Use plan, progress/rulings, finaltaskreports/reviews and actualcode. Independentreview required before phasecomplete; don't repeat supplied passing tests without a concrete hypothesis.

Primary integration boundaries: original upload durable key beforeput, spoof/size/pixel validation; image worker queue dispatch/recovery/native packaging; sanitized exactvariants and orientation; complete ancestry and private-document authorization with currentcache revalidation; allreferences/split/profile and retention/cleanup races, lockloss/lateputs discoverability; publicgallery/private-receipt UI and realworkerE2E. Verify claims against finalCI evidence.

Carryknownitems: Task1 directory entries aren't fsynced afterrename/unlink/mkdir. Minor deferred here; triage suddenpowerlossdurability/reconciliation precisely. Task2 reserved .storage-UUID.tmp crash leftovers assignedTask5, require finalclosureevidence. Task3 DBadvisory lock failure can precedeclientnotice; lease isn't IObound, arbitraryquarantine isn't proof. Task5 must address with persistentcleanuptracking/reconciliation or equivalenttestedfencing. Task2 image-backedDOCUMENT must share sanitizedvariantprocessing/readpolicy. Avatarownership andcleanup countrequired.

Rulings inprogress/canonicalledger: exactlimits20MiB/25MiB/40Mpixels, allowedJPEGPNGWebP/PDF; unsupportedpre-mediaavatarUUIDresetmigration; splitsharedlinks; Task6 minimalpublicreadonlygallery/noindex tillPhase14; no speculativecatalog/membership. No code merge/deploy/liveproviders. P03nonblocking blankinteger->0 andhierarchyduplicateleaflabels stayseparate canonicalfollowups, no unrelatedexpansion.

Finalreport should list actionable Critical/Important findings with exactreproduction/fix and nonblockingminorfollowups. Oneconsolidatedfixwave then narrowrereview, finalfullCI aftersourcefixes. Do notmarkphasecompletewhileImportantopen.
