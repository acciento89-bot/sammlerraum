"use client";

import {
  CreateItemMoneyInputSchema,
  UpdateItemMoneyInputSchema,
  ItemMoneyResultSchema,
} from "@sammlerraum/contracts/personal-money";
import type { MoneyCapabilities } from "@sammlerraum/contracts/money-capabilities";
import { LegacyMoneyIdSchema, type MoneyView } from "@sammlerraum/contracts/legacy-money";
import { readCurrentPersonalMoney } from "../money/money-review-client";
import { LegacyMoneyReview } from "../money/legacy-money-review";
import { activeMoneyReview, setActiveMoneyReview } from "../money/money-review-draft";
import {
  readCustomMoney,
  writeCustomMoney,
  bindCreatedCustomDraft,
} from "../money/custom-money-client";
import { LegacyMoneyEditor, MoneyReadout } from "../money/legacy-money-editor";
import {
  MoneyDraftError,
  initialMoneyDraft,
  moneyDraftIntent,
  rememberMoneyDraft,
  recallMoneyDraft,
  clearMoneyDrafts,
  forgetMoneyDraft,
  type MoneyDraft,
} from "../money/legacy-money-draft";
import {
  loadMoneyCapabilities,
  requireMoneyAuthoring,
  readMoney,
  writeMoney,
  MoneyClientError,
} from "../money/legacy-money-client";
import { acceptsMoneyAcknowledgement } from "../money/legacy-money-acknowledgement";
import { useCollectorConfirmation } from "../search/use-saved-confirmation";
import { ConditionGradingEditor } from "./condition-grading-editor";
import { ItemGalleryEditor } from "../media/item-gallery-editor";
import type { Collection, CollectionNode } from "@sammlerraum/contracts/collections";
import type {
  CanonicalCustomFieldValue,
  CustomFieldDefinition,
  CustomFieldType,
} from "@sammlerraum/contracts/custom-fields";
import type { AcquisitionType, CollectibleItem, TradeStatus } from "@sammlerraum/contracts/items";
import type { StorageLocation } from "@sammlerraum/contracts/locations";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { errorMessage } from "../collections/collections-manager";
import { CodeScanner } from "./code-scanner";
import {
  displayCustomFieldValue,
  integerCustomFieldValue,
  tagsFromInput,
  tagsInputValue,
} from "./item-form-values";

type Identifier = { type: string; value: string };
type ItemMetadata = {
  identifiers: Array<Identifier & { id: string; itemId: string; normalizedValue: string }>;
  tags: string[];
  customFieldValues: Array<{
    fieldDefinitionId: string;
    type: CustomFieldType;
    value: CanonicalCustomFieldValue;
  }>;
  location: StorageLocation | null;
};
type ItemResponse = { item: CollectibleItem; metadata?: ItemMetadata };
type Translation = (key: string) => string;

const acquisitionTypes: AcquisitionType[] = [
  "PURCHASE",
  "GIFT",
  "TRADE",
  "INHERITANCE",
  "FOUND",
  "OTHER",
];
const tradeStatuses: TradeStatus[] = ["NOT_FOR_TRADE", "OPEN_TO_TRADE", "FOR_SALE", "RESERVED"];
const identifierTypes = [
  "EAN",
  "UPC",
  "ISBN",
  "SERIAL",
  "CERTIFICATE",
  "CATALOG",
  "MANUFACTURER",
  "INTERNAL",
  "OTHER",
];

async function read<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw response;
  return response.json() as Promise<T>;
}

export function ItemForm({
  actor,
  locale,
  itemId,
  initialCollectionId = "",
}: {
  actor: string;
  locale: "de" | "en";
  itemId?: string;
  initialCollectionId?: string;
}) {
  const media = useTranslations("Media");
  const t = useTranslations("ItemForm");
  const moneyText = useTranslations("LegacyMoney");
  const common = useTranslations("Management");
  const router = useRouter();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [collectionId, setCollectionId] = useState(initialCollectionId);
  const [nodeId, setNodeId] = useState("");
  const [optionsCollectionId, setOptionsCollectionId] = useState("");
  const [optionsLoadFailed, setOptionsLoadFailed] = useState(false);
  const [optionsRetry, setOptionsRetry] = useState(0);
  const [nodes, setNodes] = useState<CollectionNode[]>([]);
  const [fields, setFields] = useState<CustomFieldDefinition[]>([]);
  const [locations, setLocations] = useState<StorageLocation[]>([]);
  const [item, setItem] = useState<CollectibleItem>();
  const [metadata, setMetadata] = useState<ItemMetadata>();
  const [identifiers, setIdentifiers] = useState<Identifier[]>([{ type: "EAN", value: "" }]);
  const [workingItemId, setWorkingItemId] = useState(itemId ?? "");
  const [initialLocationId, setInitialLocationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const pendingNavigation = useCollectorConfirmation(saving || reviewBusy, () => false);
  const [reviewing, setReviewing] = useState<string | null>(() => {
    const subject = activeMoneyReview(actor, `item:${itemId ?? ""}`);
    return subject?.family === "PURCHASE"
      ? "PURCHASE"
      : subject?.family === "CUSTOM"
        ? subject.fieldDefinitionId
        : null;
  });
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [moneyCapabilities, setMoneyCapabilities] = useState<MoneyCapabilities>();
  const [moneyReady, setMoneyReady] = useState(false);
  const [purchaseView, setPurchaseView] = useState<MoneyView | null>(null);
  const [purchaseDraft, setPurchaseDraft] = useState<MoneyDraft>(() => initialMoneyDraft(null));
  const [customViews, setCustomViews] = useState<Record<string, MoneyView>>({});
  const [customDrafts, setCustomDrafts] = useState<Record<string, MoneyDraft>>({});
  const customDraftsRef = useRef(customDrafts);
  const [customInspected, setCustomInspected] = useState<Record<string, boolean>>({});
  const [customReady, setCustomReady] = useState(false);
  const [customReadFailed, setCustomReadFailed] = useState(false);
  const [customRetry, setCustomRetry] = useState(0);
  const customDraftKey = (fieldId: string, targetId = workingItemId) =>
    `custom:${targetId || `new:${collectionId}`}:${fieldId}`;
  function changeCustomDraft(fieldId: string, draft: MoneyDraft, targetId = workingItemId) {
    customDraftsRef.current = { ...customDraftsRef.current, [fieldId]: draft };
    setCustomDrafts(customDraftsRef.current);
    rememberMoneyDraft(actor, customDraftKey(fieldId, targetId), draft);
  }
  const customCanSave =
    customReady && Object.values(customDrafts).every((draft) => draft.outcome === "READY");
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [recoveringNew, setRecoveringNew] = useState(false);
  const [newReconciled, setNewReconciled] = useState(false),
    [newAttempt, setNewAttempt] = useState(0);
  const reviewOpening = useRef(0);
  useEffect(
    () => () => {
      reviewOpening.current++;
    },
    [actor, itemId],
  );
  const [moneyInspected, setMoneyInspected] = useState(false);
  const monetaryOwner = actor;
  const [actorExpired, setActorExpired] = useState(false);
  const purchaseDraftKey = `purchase:${workingItemId || `new:${collectionId}`}`;
  const reviewView =
    reviewing === "PURCHASE" ? purchaseView : reviewing ? (customViews[reviewing] ?? null) : null;
  async function openReview(view: MoneyView) {
    if (saving || reviewBusy) return;
    const sequence = ++reviewOpening.current;
    try {
      const caps = await loadMoneyCapabilities();
      if (!mounted.current) return;
      if (caps.actorId !== actor) {
        clearMoneyDrafts();
        setActorExpired(true);
        return;
      }
      const actual = await readCurrentPersonalMoney(view);
      if (sequence !== reviewOpening.current) return;
      setMoneyCapabilities(caps);
      if (actual.subject.family === "PURCHASE") setPurchaseView(actual);
      else if (actual.subject.family === "CUSTOM") {
        const id = actual.subject.fieldDefinitionId;
        setCustomViews((current) => ({ ...current, [id]: actual }));
      }
      setActiveMoneyReview(actor, `item:${workingItemId}`, actual.subject);
      setReviewing(
        actual.subject.family === "PURCHASE"
          ? "PURCHASE"
          : actual.subject.family === "CUSTOM"
            ? actual.subject.fieldDefinitionId
            : null,
      );
    } catch (problem) {
      if (sequence === reviewOpening.current) setError(moneyMessage(problem));
    }
  }
  async function restartNewDraft() {
    if (workingItemId || !newReconciled || saving || recoveringNew) return;
    setRecoveringNew(true);
    try {
      const caps = await loadMoneyCapabilities();
      if (!mounted.current) return;
      if (caps.actorId !== actor) {
        clearMoneyDrafts();
        setActorExpired(true);
        return;
      }
      setMoneyCapabilities(caps);
      forgetMoneyDraft(actor, purchaseDraftKey);
      setPurchaseView(null);
      setPurchaseDraft(initialMoneyDraft(null));
      const drafts: Record<string, MoneyDraft> = {};
      for (const field of fields.filter((field) => field.type === "MONEY")) {
        forgetMoneyDraft(actor, customDraftKey(field.id));
        drafts[field.id] = initialMoneyDraft(null);
      }
      customDraftsRef.current = drafts;
      setCustomDrafts(drafts);
      setCustomViews({});
      setCustomInspected({});
      setIdentifiers([{ type: "EAN", value: "" }]);
      setNodeId("");
      setInitialLocationId(null);
      setNewAttempt((value) => value + 1);
      setNewReconciled(false);
      setError("");
      setStatus("");
    } catch (problem) {
      if (mounted.current) setError(moneyMessage(problem));
    } finally {
      if (mounted.current) setRecoveringNew(false);
    }
  }
  const moneyEnabled = moneyReady && moneyCapabilities?.authoringProfiles.length === 1;
  function changePurchaseDraft(next: MoneyDraft) {
    setPurchaseDraft(next);
    if (monetaryOwner) rememberMoneyDraft(monetaryOwner, purchaseDraftKey, next);
  }
  function moneyMessage(problem: unknown) {
    if (problem instanceof MoneyDraftError)
      return moneyText(
        problem.code === "MONEY_REPLACEMENT_ACK_REQUIRED"
          ? "confirmRequired"
          : problem.code === "MONEY_CORRECTION_REASON_REQUIRED"
            ? "reasonRequired"
            : problem.code === "MONEY_DRAFT_NOT_LOADED"
              ? "readFailed"
              : problem.code === "MONEY_OUTCOME_UNCERTAIN"
                ? "unknownOutcome"
                : "invalid",
      );
    return moneyText(
      problem instanceof MoneyClientError
        ? problem.status === 413
          ? "requestTooLarge"
          : problem.code === "CONFLICT"
            ? "conflict"
            : problem.code === "OUTCOME_UNKNOWN"
              ? "unknownOutcome"
              : problem.code === "ACKNOWLEDGED_UNREADABLE"
                ? "ackUnreadable"
                : problem.code === "CAPABILITY_UNAVAILABLE"
                  ? "disabled"
                  : problem.code === "READ_FAILED"
                    ? "readFailed"
                    : "refused"
        : "invalid",
    );
  }

  // Reads started before an acknowledged write cannot restore an older item snapshot.
  const snapshotGeneration = useRef(0);

  function applyItemSnapshot(body: ItemResponse) {
    setItem(body.item);
    setMetadata(body.metadata);
    setCollectionId(body.item.collectionId);
    setNodeId(body.item.nodeId ?? "");
    setWorkingItemId(body.item.id);
    const loadedIdentifiers = body.metadata?.identifiers.map(({ type, value }) => ({
      type,
      value,
    }));
    setIdentifiers(loadedIdentifiers?.length ? loadedIdentifiers : [{ type: "EAN", value: "" }]);
    setInitialLocationId(body.metadata?.location?.id ?? null);
  }

  async function refreshItemSnapshot(targetId: string, generation: number) {
    if (generation !== snapshotGeneration.current) return true;
    try {
      const body = await read<ItemResponse>(`/api/v1/items/${targetId}`);
      if (generation === snapshotGeneration.current) applyItemSnapshot(body);
      return true;
    } catch {
      if (generation !== snapshotGeneration.current) return true;
      setError(t("refreshError"));
      return false;
    }
  }

  useEffect(() => {
    const generation = ++snapshotGeneration.current;
    let cancelled = false;
    void (async () => {
      try {
        const [collectionBody, locationBody, itemBody] = await Promise.all([
          read<{ collections: Collection[] }>("/api/v1/collections"),
          read<{ locations: StorageLocation[] }>("/api/v1/locations"),
          itemId ? read<ItemResponse>(`/api/v1/items/${itemId}`) : Promise.resolve(undefined),
        ]);
        if (cancelled || generation !== snapshotGeneration.current) return;
        setCollections(collectionBody.collections);
        setLocations(locationBody.locations);
        if (itemBody) {
          applyItemSnapshot(itemBody);
        } else if (!initialCollectionId && collectionBody.collections[0]) {
          setCollectionId(collectionBody.collections[0].id);
        }
        try {
          const capability = await loadMoneyCapabilities();
          if (capability.actorId !== actor) {
            clearMoneyDrafts();
            setActorExpired(true);
            throw new MoneyClientError("REFUSED", 401);
          }
          const actual = itemId
            ? await readMoney(
                `/api/v1/money/items/${itemId}`,
                ItemMoneyResultSchema.refine(
                  (value) =>
                    value.item.id === itemId &&
                    value.item.purchaseAmountMinor ===
                      (value.purchase.raw ? Number(value.purchase.raw.amountMinor) : null) &&
                    value.item.purchaseCurrency === (value.purchase.raw?.currency ?? null) &&
                    acceptsMoneyAcknowledgement(
                      value.purchase,
                      { family: "PURCHASE", itemId },
                      undefined,
                    ),
                ),
              )
            : undefined;
          if (cancelled || generation !== snapshotGeneration.current) return;
          setMoneyCapabilities(capability);
          if (actual && itemBody) {
            applyItemSnapshot({ ...itemBody, item: actual.item });
            setPurchaseView(actual.purchase);
            setPurchaseDraft(
              recallMoneyDraft(actor, `purchase:${itemId}`) ?? initialMoneyDraft(actual.purchase),
            );
          }
          setMoneyReady(true);
        } catch (problem) {
          if (!cancelled && generation === snapshotGeneration.current) {
            setMoneyReady(false);
            setError(moneyMessage(problem));
          }
        }
      } catch (problem) {
        const message =
          problem instanceof Response
            ? await errorMessage(problem, common("error"))
            : common("error");
        if (!cancelled && generation === snapshotGeneration.current) setError(message);
      } finally {
        if (!cancelled && generation === snapshotGeneration.current) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      snapshotGeneration.current++;
    };
  }, [itemId, initialCollectionId, common, moneyText, actor]);

  useEffect(() => {
    if (workingItemId || !LegacyMoneyIdSchema.safeParse(collectionId).success) return;
    const url = new URL(window.location.href);
    if (url.pathname !== `/${locale}/items/new`) return;
    if (
      url.searchParams.getAll("collectionId").length !== 1 ||
      url.searchParams.get("collectionId") !== collectionId
    ) {
      url.searchParams.set("collectionId", collectionId);
      window.history.replaceState(window.history.state, "", url);
    }
    window.dispatchEvent(new Event("sammlerraum:money-history"));
  }, [workingItemId, collectionId, locale]);

  useEffect(() => {
    if (!moneyReady || workingItemId) return;
    const owner = actor;
    if (owner)
      setPurchaseDraft(
        recallMoneyDraft(owner, `purchase:new:${collectionId}`) ?? initialMoneyDraft(null),
      );
  }, [moneyReady, workingItemId, collectionId, actor]);

  async function inspectCurrentMoney() {
    if (saving) return;
    const generation = ++snapshotGeneration.current;
    setSaving(true);
    setMoneyInspected(false);
    try {
      const capability = await loadMoneyCapabilities();
      if (!mounted.current) return;
      if (capability.actorId !== actor) {
        clearMoneyDrafts();
        setActorExpired(true);
        throw new MoneyClientError("REFUSED", 401);
      }
      if (workingItemId) {
        const actual = await readMoney(
          `/api/v1/money/items/${workingItemId}`,
          ItemMoneyResultSchema.refine(
            (value) =>
              value.item.id === workingItemId &&
              value.item.purchaseAmountMinor ===
                (value.purchase.raw ? Number(value.purchase.raw.amountMinor) : null) &&
              value.item.purchaseCurrency === (value.purchase.raw?.currency ?? null) &&
              acceptsMoneyAcknowledgement(
                value.purchase,
                { family: "PURCHASE", itemId: workingItemId },
                undefined,
              ),
          ),
        );
        if (generation !== snapshotGeneration.current) return;
        setPurchaseView(actual.purchase);
        setMoneyInspected(true);
      }
      if (generation === snapshotGeneration.current) {
        setMoneyCapabilities(capability);
        setMoneyReady(true);
      }
    } catch (problem) {
      if (generation === snapshotGeneration.current) setError(moneyMessage(problem));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!collectionId) {
      setNodes([]);
      setFields([]);
      setOptionsCollectionId("");
      setOptionsLoadFailed(false);
      return;
    }
    setOptionsCollectionId("");
    setOptionsLoadFailed(false);
    setNodes([]);
    setFields([]);
    let cancelled = false;
    void Promise.all([
      read<{ nodes: CollectionNode[] }>(`/api/v1/collections/${collectionId}/nodes`),
      read<{ customFields: CustomFieldDefinition[] }>(
        `/api/v1/collections/${collectionId}/custom-fields`,
      ),
    ])
      .then(([nodeBody, fieldBody]) => {
        if (!cancelled) {
          setNodes(nodeBody.nodes);
          setFields(fieldBody.customFields);
          setOptionsCollectionId(collectionId);
          setOptionsLoadFailed(false);
          setError("");
        }
      })
      .catch(async (problem) => {
        if (!cancelled) {
          setOptionsLoadFailed(true);
          setError(
            problem instanceof Response
              ? await errorMessage(problem, common("error"))
              : common("error"),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [collectionId, common, optionsRetry]);

  useEffect(() => {
    if (saving || optionsCollectionId !== collectionId || !moneyReady) return;
    let cancelled = false;
    setCustomReady(false);
    setCustomReadFailed(false);
    const definitions = fields.filter((field) => field.type === "MONEY").map((field) => field.id);
    void (
      workingItemId
        ? readCustomMoney(workingItemId, definitions)
        : Promise.resolve({} as Record<string, MoneyView>)
    )
      .then((views) => {
        if (cancelled) return;
        const drafts: Record<string, MoneyDraft> = {};
        for (const id of definitions) {
          const stored = recallMoneyDraft(actor, customDraftKey(id));
          drafts[id] =
            stored && views[id]
              ? bindCreatedCustomDraft(stored, views[id]!)
              : (stored ?? initialMoneyDraft(views[id] ?? null));
        }
        setCustomViews(views);
        customDraftsRef.current = drafts;
        setCustomDrafts(drafts);
        setCustomReady(true);
      })
      .catch((problem) => {
        if (!cancelled) {
          setCustomReadFailed(true);
          setError(moneyMessage(problem));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [
    actor,
    workingItemId,
    collectionId,
    optionsCollectionId,
    fields,
    moneyReady,
    saving,
    customRetry,
  ]);

  const inactive = Boolean(item?.archivedAt || item?.disposedAt);
  const valueByField = new Map(
    metadata?.customFieldValues.map((record) => [record.fieldDefinitionId, record.value]) ?? [],
  );

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !collectionId ||
      optionsCollectionId !== collectionId ||
      inactive ||
      !moneyEnabled ||
      !customCanSave ||
      reviewBusy ||
      purchaseDraft.outcome !== "READY"
    )
      return;
    setSaving(true);
    setError("");
    setStatus("");
    const form = new FormData(event.currentTarget);
    let purchaseIntent: ReturnType<typeof moneyDraftIntent>;
    try {
      purchaseIntent = moneyDraftIntent(purchaseDraft, purchaseView, Boolean(workingItemId));
    } catch (problem) {
      setError(moneyMessage(problem));
      setSaving(false);
      return;
    }
    const core = {
      nodeId: nodeId || null,
      title: form.get("title"),
      publicDescription: String(form.get("publicDescription") ?? "").trim() || null,
      privateNotes: String(form.get("privateNotes") ?? "").trim() || null,
      quantity: Number(form.get("quantity")),
      acquisitionType: form.get("acquisitionType"),
      acquisitionDate: String(form.get("acquisitionDate") ?? "") || null,
      visibility: form.get("visibility"),
      tradeStatus: form.get("tradeStatus"),
    };
    const cleanIdentifiers = identifiers
      .map((identifier) => ({ type: identifier.type, value: identifier.value.trim() }))
      .filter((identifier) => identifier.value);
    const tags = tagsFromInput(String(form.get("tags") ?? ""));
    const fieldValues: Array<{ id: string; value: CanonicalCustomFieldValue | null }> = [];
    try {
      for (const field of fields) {
        if (field.type === "MONEY") continue;
        const enabled = form.has(`field-enabled-${field.id}`);
        const value = enabled ? customValue(field, form) : null;
        fieldValues.push({ id: field.id, value });
      }
    } catch {
      setError(t("fieldInvalid"));
      setSaving(false);
      return;
    }

    // Validate every deliberate field edit before any core mutation begins.
    try {
      for (const field of fields.filter((field) => field.type === "MONEY"))
        moneyDraftIntent(
          customDraftsRef.current[field.id]!,
          customViews[field.id] ?? null,
          Boolean(workingItemId),
        );
    } catch (problem) {
      setError(moneyMessage(problem));
      setSaving(false);
      return;
    }
    const selectedLocationId = String(form.get("locationId") ?? "") || null;
    let createdNow = false;
    try {
      let targetId = workingItemId;
      const capability = await loadMoneyCapabilities();
      if (!mounted.current) return;
      if (capability.actorId !== actor) {
        clearMoneyDrafts();
        setActorExpired(true);
        throw new MoneyClientError("REFUSED", 401);
      }
      setMoneyCapabilities(capability);
      requireMoneyAuthoring(capability);
      if (targetId && !item) throw new MoneyClientError("READ_FAILED");
      const previous = item as unknown as Record<string, unknown> | undefined;
      const changedCore =
        targetId && previous
          ? Object.fromEntries(
              Object.entries(core).filter(
                ([key, value]) => JSON.stringify(previous[key]) !== JSON.stringify(value),
              ),
            )
          : core;
      let generation = ++snapshotGeneration.current;
      // Existing text/metadata that was not edited never consumes the strict money-body budget.
      // A metadata-only save has no core write or fabricated financial acknowledgment.
      if (!targetId || Object.keys(changedCore).length > 0 || purchaseIntent !== undefined) {
        const requestBody = targetId
          ? UpdateItemMoneyInputSchema.parse({
              schemaVersion: 1,
              item: changedCore,
              ...(purchaseIntent ? { purchase: purchaseIntent } : {}),
            })
          : CreateItemMoneyInputSchema.parse({
              schemaVersion: 1,
              item: { ...core, collectionId },
              ...(purchaseIntent ? { purchase: purchaseIntent } : {}),
            });
        const oldId = targetId;
        const coreBody = await writeMoney(
          targetId ? `/api/v1/money/items/${targetId}` : "/api/v1/money/items",
          targetId ? "PATCH" : "POST",
          requestBody,
          ItemMoneyResultSchema.refine((value) => {
            if ((oldId && value.item.id !== oldId) || value.item.collectionId !== collectionId)
              return false;
            if (!oldId && !purchaseIntent && value.purchase.raw !== null) return false;
            const actual = value.item as unknown as Record<string, unknown>;
            if (
              !Object.entries(requestBody.item).every(
                ([key, expected]) => JSON.stringify(actual[key]) === JSON.stringify(expected),
              )
            )
              return false;
            if (
              !acceptsMoneyAcknowledgement(
                value.purchase,
                { family: "PURCHASE", itemId: value.item.id },
                purchaseIntent,
              )
            )
              return false;
            return (
              value.item.purchaseAmountMinor ===
                (value.purchase.raw ? Number(value.purchase.raw.amountMinor) : null) &&
              value.item.purchaseCurrency === (value.purchase.raw?.currency ?? null)
            );
          }),
          capability,
        );
        if (!mounted.current) return;
        // Install the receipt before metadata writes or a fallible refresh can occur.
        const acknowledgedDraft = initialMoneyDraft(coreBody.purchase);
        setPurchaseView(coreBody.purchase);
        setPurchaseDraft(acknowledgedDraft);
        setMoneyInspected(false);
        if (monetaryOwner) {
          forgetMoneyDraft(monetaryOwner, purchaseDraftKey);
          rememberMoneyDraft(monetaryOwner, `purchase:${coreBody.item.id}`, acknowledgedDraft);
        }
        generation = ++snapshotGeneration.current;
        setItem(coreBody.item);
        if (!targetId) {
          targetId = coreBody.item.id;
          createdNow = true;
          setWorkingItemId(targetId);
          setStatus(t("coreCreated"));
        }
      }

      const moneyFields = fields.filter((field) => field.type === "MONEY");
      let currentViews = customViews;
      if (createdNow && moneyFields.length) {
        // Bind pending new-item edits to actual server absence, never a fabricated token.
        for (const field of moneyFields) {
          const draft = customDraftsRef.current[field.id]!;
          forgetMoneyDraft(actor, customDraftKey(field.id));
          changeCustomDraft(field.id, draft, targetId);
        }
        currentViews = await readCustomMoney(
          targetId,
          moneyFields.map((field) => field.id),
        );
        if (!mounted.current) return;
        setCustomViews(currentViews);
        for (const field of moneyFields) {
          const draft = bindCreatedCustomDraft(
            customDraftsRef.current[field.id]!,
            currentViews[field.id]!,
          );
          forgetMoneyDraft(actor, customDraftKey(field.id));
          changeCustomDraft(field.id, draft, targetId);
        }
      }
      for (const field of moneyFields) {
        const draft = customDraftsRef.current[field.id]!;
        try {
          const intent = moneyDraftIntent(draft, currentViews[field.id] ?? null, true);
          if (!intent) continue;
          if (intent.op === "NEW") throw new MoneyClientError("REFUSED");
          const acknowledged = await writeCustomMoney(targetId, field.id, intent, capability);
          if (!mounted.current) return;
          currentViews = { ...currentViews, [field.id]: acknowledged };
          setCustomViews(currentViews);
          // Commit this acknowledgment before another field or metadata request can fail.
          changeCustomDraft(field.id, initialMoneyDraft(acknowledged), targetId);
        } catch (problem) {
          if (!mounted.current) return;
          if (
            problem instanceof MoneyClientError &&
            ["OUTCOME_UNKNOWN", "ACKNOWLEDGED_UNREADABLE", "CONFLICT"].includes(problem.code)
          )
            changeCustomDraft(
              field.id,
              {
                ...draft,
                outcome:
                  problem.code === "OUTCOME_UNKNOWN"
                    ? "UNKNOWN"
                    : problem.code === "CONFLICT"
                      ? "CONFLICT"
                      : "ACKNOWLEDGED_UNREADABLE",
              },
              targetId,
            );
          setError(`${field.name}: ${moneyMessage(problem)}`);
          setStatus(t("retryWithoutDuplicate"));
          return;
        }
      }
      const requests: Array<{ kind: string; response: Promise<Response> }> = [
        {
          kind: "identifiers",
          response: put(`/api/v1/items/${targetId}/identifiers`, {
            identifiers: cleanIdentifiers,
          }),
        },
        { kind: "tags", response: put(`/api/v1/items/${targetId}/tags`, { tags }) },
        ...fieldValues.map(({ id, value }) => ({
          kind: `field-${id}`,
          response: put(`/api/v1/items/${targetId}/custom-fields/${id}`, { value }),
        })),
      ];
      if (selectedLocationId !== initialLocationId) {
        requests.push({
          kind: "location",
          response: put(`/api/v1/items/${targetId}/location`, {
            locationId: selectedLocationId,
          }),
        });
      }
      const responses = await Promise.allSettled(requests.map((request) => request.response));
      const locationIndex = requests.findIndex((request) => request.kind === "location");
      const locationResult = responses[locationIndex];
      if (locationResult?.status === "fulfilled" && locationResult.value.ok) {
        setInitialLocationId(selectedLocationId);
      }
      const failed = responses.find((result) => result.status === "rejected" || !result.value.ok);
      if (failed) {
        const fallback = createdNow ? t("partialSaveError") : t("metadataSaveError");
        setError(
          failed.status === "fulfilled" ? await errorMessage(failed.value, fallback) : fallback,
        );
        setStatus(t("retryWithoutDuplicate"));
        return;
      }

      if (!(await refreshItemSnapshot(targetId, generation))) {
        setStatus(t("retryWithoutDuplicate"));
        return;
      }
      pendingNavigation.navigateAfterGuard(() => {
        router.push(`/${locale}/items/${targetId}`);
        router.refresh();
      });
    } catch (problem) {
      if (!mounted.current) return;
      if (problem instanceof MoneyClientError) {
        if (
          problem.code === "OUTCOME_UNKNOWN" ||
          problem.code === "ACKNOWLEDGED_UNREADABLE" ||
          problem.code === "CONFLICT"
        ) {
          ++snapshotGeneration.current;
          changePurchaseDraft({
            ...purchaseDraft,
            outcome: problem.code === "OUTCOME_UNKNOWN" ? "UNKNOWN" : problem.code,
          });
          setMoneyInspected(false);
        }
        setError(moneyMessage(problem));
        return;
      }
      setError(
        problem instanceof Response
          ? await errorMessage(problem, common("error"))
          : createdNow
            ? t("partialSaveError")
            : common("error"),
      );
      if (createdNow) setStatus(t("retryWithoutDuplicate"));
    } finally {
      setSaving(false);
    }
  }

  async function archive() {
    if (!workingItemId || inactive || !window.confirm(t("archiveConfirm"))) return;
    try {
      const response = await fetch(`/api/v1/items/${workingItemId}/archive`, { method: "POST" });
      if (!response.ok) throw response;
      const body = (await response.json()) as { item: CollectibleItem };
      const generation = ++snapshotGeneration.current;
      setItem(body.item);
      setStatus(t("archived"));
      await refreshItemSnapshot(body.item.id, generation);
    } catch (problem) {
      setError(
        problem instanceof Response
          ? await errorMessage(problem, common("error"))
          : common("error"),
      );
    }
  }

  async function remove() {
    if (!workingItemId || !window.confirm(t("deleteConfirm"))) return;
    try {
      const response = await fetch(`/api/v1/items/${workingItemId}`, { method: "DELETE" });
      if (!response.ok) throw response;
      router.push(`/${locale}/collections/${collectionId}`);
      router.refresh();
    } catch (problem) {
      setError(
        problem instanceof Response
          ? await errorMessage(problem, common("error"))
          : common("error"),
      );
    }
  }

  if (actorExpired)
    return (
      <section className="management-shell">
        <p className="notice" role="alert">
          {moneyText("sessionChanged")}
        </p>
        <Link href={`/${locale}/login`}>{moneyText("signIn")}</Link>
      </section>
    );
  if (loading) {
    return (
      <section className="management-shell">
        <p role="status">{common("loading")}</p>
      </section>
    );
  }

  return (
    <section className="management-shell">
      {pendingNavigation.node}
      <nav className="management-nav" aria-label={common("navigation")}>
        <Link
          href={collectionId ? `/${locale}/collections/${collectionId}` : `/${locale}/collections`}
        >
          {t("back")}
        </Link>
        {item && <Link href={`/${locale}/items/${item.id}/values`}>{t("valuations")}</Link>}
      </nav>
      <header className="management-heading">
        <p className="eyebrow">{t(item ? "editEyebrow" : "newEyebrow")}</p>
        <h1>{item?.title ?? t("newTitle")}</h1>
        <p className="form-intro">{t("intro")}</p>
      </header>

      {reviewView && (
        <LegacyMoneyReview
          key={JSON.stringify(reviewView.subject)}
          view={reviewView}
          actor={actor}
          locale={locale}
          disabled={
            !moneyEnabled ||
            saving ||
            (reviewing === "PURCHASE"
              ? purchaseDraft.mode !== "KEEP" || purchaseDraft.outcome !== "READY"
              : customDrafts[reviewing!]?.mode !== "KEEP" ||
                customDrafts[reviewing!]?.outcome !== "READY")
          }
          onBusy={setReviewBusy}
          onExpired={() => {
            clearMoneyDrafts();
            setActorExpired(true);
          }}
          onClose={() => {
            setActiveMoneyReview(actor, `item:${workingItemId}`, null);
            setReviewing(null);
          }}
          onChanged={(next) => {
            if (next.subject.family === "PURCHASE") {
              setPurchaseView(next);
              changePurchaseDraft(initialMoneyDraft(next));
            } else if (next.subject.family === "CUSTOM") {
              setCustomViews((current) => ({
                ...current,
                [next.subject.family === "CUSTOM" ? next.subject.fieldDefinitionId : ""]: next,
              }));
              changeCustomDraft(next.subject.fieldDefinitionId, initialMoneyDraft(next));
            }
          }}
        />
      )}
      {item && metadata && (
        <ItemSummary
          item={item}
          metadata={metadata}
          fields={fields}
          moneyViews={customViews}
          locale={locale}
          t={t}
        />
      )}
      {inactive && (
        <p className="notice">{t(item?.disposedAt ? "disposedNotice" : "archivedNotice")}</p>
      )}
      {status && (
        <p className="success" role="status">
          {status}
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {workingItemId && moneyReady && (
        <details className="management-card">
          <summary>{moneyText("privateHistory")}</summary>
          {purchaseView && (
            <button
              type="button"
              className="secondary-button"
              disabled={saving || reviewBusy}
              onClick={() => {
                void openReview(purchaseView);
              }}
            >
              {moneyText("review")}: {t("unitPrice")}
            </button>
          )}
          {fields
            .filter((field) => field.type === "MONEY")
            .map(
              (field) =>
                customViews[field.id] && (
                  <button
                    key={field.id}
                    type="button"
                    className="secondary-button"
                    disabled={saving || reviewBusy}
                    onClick={() => {
                      void openReview(customViews[field.id]!);
                    }}
                  >
                    {moneyText("review")}: {field.name}
                  </button>
                ),
            )}
        </details>
      )}
      {!loading && !moneyEnabled && (
        <p className="notice" role="status">
          {moneyText("disabled")}
        </p>
      )}
      {customReadFailed && (
        <div className="notice" role="status">
          {moneyText("readFailed")}
          <button
            type="button"
            disabled={saving || reviewBusy}
            onClick={() => setCustomRetry((value) => value + 1)}
          >
            {moneyText("retryMoneyFields")}
          </button>
        </div>
      )}
      {(!moneyEnabled || purchaseDraft.outcome !== "READY") && !loading && (
        <div className="money-recovery notice">
          {workingItemId || purchaseDraft.outcome === "READY" ? (
            <button
              type="button"
              className="secondary-button"
              disabled={saving}
              onClick={inspectCurrentMoney}
            >
              {moneyText("checkCurrent")}
            </button>
          ) : (
            <Link href={`/${locale}/collections/${collectionId}`}>
              {moneyText("collectionCheck")}
            </Link>
          )}
          {!workingItemId && purchaseDraft.outcome !== "READY" && (
            <div>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={newReconciled}
                  onChange={(event) => setNewReconciled(event.target.checked)}
                />
                {moneyText("newReconciled")}
              </label>
              <button
                type="button"
                className="secondary-button"
                disabled={!newReconciled || saving || recoveringNew}
                onClick={restartNewDraft}
              >
                {moneyText(recoveringNew ? "checking" : "restartNew")}
              </button>
            </div>
          )}
          {purchaseDraft.outcome !== "READY" && moneyInspected && purchaseView && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                changePurchaseDraft(initialMoneyDraft(purchaseView));
                setMoneyInspected(false);
                setError("");
              }}
            >
              {moneyText("adoptCurrent")}
            </button>
          )}
        </div>
      )}

      {collections.length === 0 ? (
        <div className="management-card">
          <p>{t("noCollections")}</p>
          <Link href={`/${locale}/collections`}>{t("createCollection")}</Link>
        </div>
      ) : (
        <form key={newAttempt} className="item-form" onSubmit={save}>
          <fieldset disabled={inactive || saving || reviewBusy || recoveringNew}>
            <legend>{t("basic")}</legend>
            {!item && (
              <label>
                {t("collection")}
                <select
                  aria-label={t("collection")}
                  name="collectionId"
                  value={collectionId}
                  onChange={(event) => {
                    setNodeId("");
                    setCollectionId(event.target.value);
                  }}
                  required
                >
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {t("node")}
              <select
                name="nodeId"
                value={nodeId}
                onChange={(event) => setNodeId(event.target.value)}
                disabled={optionsCollectionId !== collectionId}
              >
                <option value="">{t("collectionRoot")}</option>
                {nodes.map((node) => (
                  <option key={node.id} value={node.id}>
                    {node.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t("title")}
              <input name="title" defaultValue={item?.title ?? ""} maxLength={200} required />
            </label>
            <label>
              {t("publicDescription")}
              <textarea
                name="publicDescription"
                defaultValue={item?.publicDescription ?? ""}
                maxLength={10000}
              />
              <span className="field-help">{t("publicDescriptionHelp")}</span>
            </label>
            <label>
              {t("privateNotes")}
              <textarea
                name="privateNotes"
                defaultValue={item?.privateNotes ?? ""}
                maxLength={10000}
              />
              <span className="field-help">{t("privateNotesHelp")}</span>
            </label>
            <div className="form-row">
              <label>
                {t("quantity")}
                <input
                  name="quantity"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={item?.quantity ?? 1}
                  required
                />
              </label>
              <label>
                {common("visibility")}
                <select name="visibility" defaultValue={item?.visibility ?? "PRIVATE"}>
                  <option value="PRIVATE">{common("visibilityPRIVATE")}</option>
                  <option value="UNLISTED">{common("visibilityUNLISTED")}</option>
                  <option value="PUBLIC">{common("visibilityPUBLIC")}</option>
                </select>
              </label>
            </div>
          </fieldset>
          {optionsLoadFailed && (
            <button
              className="secondary-button"
              type="button"
              onClick={() => setOptionsRetry((value) => value + 1)}
            >
              {common("retryLoad")}
            </button>
          )}

          <details open>
            <summary>{t("acquisition")}</summary>
            <fieldset
              disabled={inactive || saving || reviewBusy || recoveringNew}
              className="details-fields"
            >
              <label>
                {t("acquisitionType")}
                <select name="acquisitionType" defaultValue={item?.acquisitionType ?? "OTHER"}>
                  {acquisitionTypes.map((type) => (
                    <option key={type} value={type}>
                      {t(`acquisitionType${type}`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {t("acquisitionDate")}
                <input
                  name="acquisitionDate"
                  type="date"
                  defaultValue={item?.acquisitionDate ?? ""}
                />
              </label>
              <LegacyMoneyEditor
                label={t("unitPrice")}
                name="purchaseAmount"
                locale={locale}
                view={purchaseView}
                existing={Boolean(workingItemId)}
                draft={purchaseDraft}
                onChange={changePurchaseDraft}
                loaded={moneyReady}
                onReview={() => {
                  if (purchaseView) openReview(purchaseView);
                }}
                disabled={!moneyEnabled || saving || inactive || purchaseDraft.outcome !== "READY"}
              />
              <label>
                {t("tradeStatus")}
                <select name="tradeStatus" defaultValue={item?.tradeStatus ?? "NOT_FOR_TRADE"}>
                  {tradeStatuses.map((tradeStatus) => (
                    <option key={tradeStatus} value={tradeStatus}>
                      {t(`tradeStatus${tradeStatus}`)}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          </details>

          <details open>
            <summary>{t("organization")}</summary>
            <fieldset
              disabled={inactive || saving || reviewBusy || recoveringNew}
              className="details-fields"
            >
              <label>
                {t("tags")}
                <input name="tags" defaultValue={tagsInputValue(metadata?.tags ?? [])} />
                <span className="field-help">{t("tagsHelp")}</span>
              </label>
              <label>
                {t("location")}
                <select name="locationId" defaultValue={metadata?.location?.id ?? ""}>
                  <option value="">{t("noLocation")}</option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.name}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
          </details>

          <details>
            <summary>{t("identifiers")}</summary>
            <fieldset
              disabled={inactive || saving || reviewBusy || recoveringNew}
              className="details-fields"
            >
              {identifiers.map((identifier, index) => (
                <div className="identifier-row" key={index}>
                  <label>
                    {t("identifierType")}
                    <select
                      value={identifier.type}
                      onChange={(event) =>
                        setIdentifiers((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index ? { ...entry, type: event.target.value } : entry,
                          ),
                        )
                      }
                    >
                      {identifierTypes.map((type) => (
                        <option key={type} value={type}>
                          {t(`identifierType${type}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <CodeScanner
                    label={t("identifierValue")}
                    value={identifier.value}
                    disabled={inactive || saving || reviewBusy || recoveringNew}
                    onChange={(value) =>
                      setIdentifiers((current) =>
                        current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, value } : entry,
                        ),
                      )
                    }
                    copy={{
                      start: t("scanStart"),
                      stop: t("scanStop"),
                      unavailable: t("scanUnavailable"),
                      proposal: t("scanProposal"),
                      confirm: t("scanConfirm"),
                      cameraError: t("scanError"),
                    }}
                  />
                  {identifiers.length > 1 && (
                    <button
                      className="text-button"
                      type="button"
                      onClick={() =>
                        setIdentifiers((current) =>
                          current.filter((_, entryIndex) => entryIndex !== index),
                        )
                      }
                    >
                      {t("removeIdentifier")}
                    </button>
                  )}
                </div>
              ))}
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  setIdentifiers((current) => [...current, { type: "OTHER", value: "" }])
                }
              >
                {t("addIdentifier")}
              </button>
            </fieldset>
          </details>

          {fields.length > 0 && (
            <details open>
              <summary>{t("customFields")}</summary>
              <fieldset
                disabled={inactive || saving || reviewBusy || recoveringNew}
                className="details-fields custom-fields"
              >
                {fields.map((field) =>
                  field.type === "MONEY" ? (
                    <div key={field.id} className="money-editor">
                      <LegacyMoneyEditor
                        label={field.name}
                        name={`custom-money-${field.id}`}
                        locale={locale}
                        view={customViews[field.id] ?? null}
                        existing={Boolean(workingItemId)}
                        draft={customDrafts[field.id] ?? initialMoneyDraft(null)}
                        onChange={(draft) => changeCustomDraft(field.id, draft)}
                        loaded={customReady}
                        onReview={() => {
                          if (customViews[field.id]) openReview(customViews[field.id]!);
                        }}
                        disabled={
                          !moneyEnabled ||
                          saving ||
                          inactive ||
                          customDrafts[field.id]?.outcome !== "READY"
                        }
                      />
                      {customDrafts[field.id]?.outcome !== "READY" && customDrafts[field.id] && (
                        <button
                          type="button"
                          className="secondary-button"
                          disabled={saving}
                          onClick={async () => {
                            try {
                              const caps = await loadMoneyCapabilities();
                              if (caps.actorId !== actor) {
                                clearMoneyDrafts();
                                setActorExpired(true);
                                return;
                              }
                              const fresh = await readCustomMoney(workingItemId, [field.id]);
                              setCustomViews((current) => ({ ...current, ...fresh }));
                              // Inspection alone never resets a frozen or uncertain draft.
                              setCustomInspected((current) => ({ ...current, [field.id]: true }));
                            } catch (problem) {
                              setError(moneyMessage(problem));
                            }
                          }}
                        >
                          {moneyText("checkCurrent")}
                        </button>
                      )}
                      {customInspected[field.id] &&
                        customDrafts[field.id]?.outcome !== "READY" &&
                        customViews[field.id] && (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => {
                              changeCustomDraft(
                                field.id,
                                initialMoneyDraft(customViews[field.id]!),
                              );
                              setCustomInspected((current) => ({ ...current, [field.id]: false }));
                              setError("");
                            }}
                          >
                            {moneyText("adoptCurrent")}
                          </button>
                        )}
                    </div>
                  ) : (
                    <CustomFieldControl
                      key={field.id}
                      field={field}
                      value={valueByField.get(field.id)}
                      t={t}
                    />
                  ),
                )}
              </fieldset>
            </details>
          )}

          <div className="form-actions">
            <button
              type="submit"
              disabled={
                inactive ||
                saving ||
                optionsCollectionId !== collectionId ||
                !moneyEnabled ||
                !customCanSave ||
                reviewBusy ||
                recoveringNew ||
                purchaseDraft.outcome !== "READY"
              }
            >
              {saving ? t("saving") : t("save")}
            </button>
            {item && (
              <>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={inactive}
                  onClick={archive}
                >
                  {t("archive")}
                </button>
                <button className="danger-button" type="button" onClick={remove}>
                  {t("delete")}
                </button>
              </>
            )}
          </div>
        </form>
      )}
      {workingItemId ? (
        <ConditionGradingEditor
          itemId={workingItemId}
          locale={locale}
          quantity={item?.quantity ?? 1}
          readOnly={inactive}
        />
      ) : (
        <p className="field-help">{t("saveBeforeReference")}</p>
      )}
      {workingItemId && !inactive ? (
        <ItemGalleryEditor itemId={workingItemId} />
      ) : !workingItemId ? (
        <p>{media("saveFirst")}</p>
      ) : null}
    </section>
  );
}

async function put(url: string, body: unknown): Promise<Response> {
  const response = await fetch(url, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  // Finish the bounded owned API response before considering this metadata request settled.
  // Preserve its original body for the existing error-message reader.
  await response.clone().arrayBuffer();
  return response;
}

function customValue(field: CustomFieldDefinition, form: FormData): CanonicalCustomFieldValue {
  const name = `field-${field.id}`;
  switch (field.type) {
    case "SHORT_TEXT":
    case "LONG_TEXT":
    case "DATE":
    case "SINGLE_SELECT":
    case "URL":
      return String(form.get(name) ?? "");
    case "INTEGER":
      return integerCustomFieldValue(String(form.get(name)));
    case "DECIMAL":
      return String(form.get(name) ?? "").replace(",", ".");
    case "BOOLEAN":
      return form.has(name);
    case "MULTI_SELECT":
      return form.getAll(name).map(String);
    case "MONEY":
      throw new Error("Money fields require an explicit money intent");
  }
}

function CustomFieldControl({
  field,
  value,
  t,
}: {
  field: CustomFieldDefinition;
  value: CanonicalCustomFieldValue | undefined;
  t: Translation;
}) {
  const name = `field-${field.id}`;
  const enabled = value !== undefined;
  const wrapper = (control: ReactNode) => (
    <div className="custom-field">
      <label className="checkbox-label">
        <input type="checkbox" name={`field-enabled-${field.id}`} defaultChecked={enabled} />
        {t("setCustomField")}
      </label>
      {control}
    </div>
  );
  if (field.type === "LONG_TEXT") {
    return wrapper(
      <label>
        {field.name}
        <textarea name={name} defaultValue={typeof value === "string" ? value : ""} />
      </label>,
    );
  }
  if (field.type === "BOOLEAN") {
    return wrapper(
      <label className="checkbox-label">
        <input name={name} type="checkbox" defaultChecked={value === true} />
        {field.name}
      </label>,
    );
  }
  if (field.type === "SINGLE_SELECT") {
    return wrapper(
      <label>
        {field.name}
        <select name={name} defaultValue={typeof value === "string" ? value : ""}>
          <option value="">{t("chooseOption")}</option>
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>,
    );
  }
  if (field.type === "MULTI_SELECT") {
    const selected = Array.isArray(value) ? value : [];
    return wrapper(
      <fieldset>
        <legend>{field.name}</legend>
        {field.options.map((option) => (
          <label className="checkbox-label" key={option}>
            <input
              name={name}
              type="checkbox"
              value={option}
              defaultChecked={selected.includes(option)}
            />
            {option}
          </label>
        ))}
      </fieldset>,
    );
  }
  if (field.type === "MONEY") return null;
  const inputType =
    field.type === "DATE"
      ? "date"
      : field.type === "URL"
        ? "url"
        : field.type === "INTEGER"
          ? "number"
          : "text";
  return wrapper(
    <label>
      {field.name}
      <input
        aria-label={field.name}
        name={name}
        type={inputType}
        step={field.type === "INTEGER" ? "1" : undefined}
        inputMode={field.type === "DECIMAL" ? "decimal" : undefined}
        defaultValue={typeof value === "number" || typeof value === "string" ? String(value) : ""}
      />
    </label>,
  );
}

function ItemSummary({
  metadata,
  fields,
  moneyViews,
  locale,
  t,
}: {
  item: CollectibleItem;
  metadata: ItemMetadata;
  fields: CustomFieldDefinition[];
  moneyViews: Record<string, MoneyView>;
  locale: "de" | "en";
  t: Translation;
}) {
  return (
    <section className="management-card item-summary" aria-label={t("savedDetails")}>
      {metadata.customFieldValues.map((record) => {
        const field = fields.find((candidate) => candidate.id === record.fieldDefinitionId);
        return field ? (
          <div key={record.fieldDefinitionId}>
            {field.type === "MONEY" ? (
              moneyViews[field.id] ? (
                <MoneyReadout view={moneyViews[field.id]!} locale={locale} label={field.name} />
              ) : (
                <span>
                  {field.name}:{" "}
                  {typeof record.value === "object" &&
                  record.value !== null &&
                  "amountMinor" in record.value
                    ? `${record.value.amountMinor} ${record.value.currency}`
                    : "—"}
                </span>
              )
            ) : (
              <p>
                {field.name}: {displayCustomFieldValue(record.value, field.type, locale)}
              </p>
            )}
          </div>
        ) : null;
      })}
      {metadata.location && <p>{metadata.location.name}</p>}
      {metadata.identifiers.length > 0 && (
        <ul className="plain-list">
          {metadata.identifiers.map((identifier) => (
            <li key={identifier.id}>{identifier.value}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
