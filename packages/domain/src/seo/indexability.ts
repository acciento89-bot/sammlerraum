/** Facts must come from authorized current server reads, never from request input. */
export type PublicVisibilityFacts = {
  visibility: "PUBLIC" | "UNLISTED" | "PRIVATE";
  deletedAt?: Date | string | null;
  moderationHiddenAt?: Date | string | null;
  ancestorsResolved?: boolean;
  cyclic?: boolean;
};
export type IndexabilityDecision = {
  index: boolean;
  reason:
    | "PROFILE_OPT_OUT"
    | "RESOURCE_NOT_PUBLIC"
    | "PRIVATE_ANCESTOR"
    | "MODERATION_HIDDEN"
    | "SOFT_DELETED"
    | "INDEXABLE";
};
export function getPublicIndexability(
  resource: PublicVisibilityFacts | null,
  ancestors: readonly PublicVisibilityFacts[],
  profile: { searchEngineIndexingEnabled?: boolean } | null,
): IndexabilityDecision {
  if (profile?.searchEngineIndexingEnabled !== true)
    return { index: false, reason: "PROFILE_OPT_OUT" };
  if (!resource || resource.visibility !== "PUBLIC")
    return { index: false, reason: "RESOURCE_NOT_PUBLIC" };
  if ([resource, ...ancestors].some((r) => r.deletedAt != null))
    return { index: false, reason: "SOFT_DELETED" };
  if ([resource, ...ancestors].some((r) => r.moderationHiddenAt != null))
    return { index: false, reason: "MODERATION_HIDDEN" };
  if (
    [resource, ...ancestors].some((r) => r.ancestorsResolved === false || r.cyclic === true) ||
    ancestors.some((r) => r.visibility !== "PUBLIC")
  )
    return { index: false, reason: "PRIVATE_ANCESTOR" };
  return { index: true, reason: "INDEXABLE" };
}
