import { randomUUID, createHash } from "node:crypto";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import { LocalPersistentStorage } from "@sammlerraum/storage";
import { createAIAnalysisService } from "@sammlerraum/domain/ai/ai-analysis-service";
import { searchFixture, cleanupSearchFixture, db, origin } from "./search-fixture";
export async function aiCaptureFixture(page: Page, ready = true) {
  if (!db || !process.env.UPLOADS_DIR) throw Error("Guarded fixture required");
  const f = await searchFixture(),
    storage = new LocalPersistentStorage(process.env.UPLOADS_DIR),
    keys: string[] = [];
  let assetId: string | null = null;
  const cleanup = async () => {
    for (const key of keys) await storage.delete(key);
    if (assetId) {
      await db!.mediaLink.deleteMany({ where: { assetId, ownerId: f.ownerId } });
      await db!.mediaVariant.deleteMany({ where: { assetId } });
      await db!.mediaAsset.deleteMany({ where: { id: assetId, ownerId: f.ownerId } });
    }
    await cleanupSearchFixture(f);
  };
  try {
    const signed = await page.request.post("/api/auth/sign-in/email", {
      headers: { origin, "x-forwarded-for": f.ip },
      data: { email: f.email, password: f.password },
    });
    if (signed.status() !== 200) throw Error("Fixture sign-in failed");
    const bytes = await sharp(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="#e7efe9"/><ellipse cx="320" cy="390" rx="150" ry="18" fill="#c3d3c7"/><path d="M235 145 Q205 390 320 385 Q435 390 405 145Z" fill="#3f8074"/><ellipse cx="320" cy="145" rx="85" ry="22" fill="#265f57"/><path d="M260 205L385 205M253 230L390 230" stroke="#e8d6a4" stroke-width="10"/></svg>',
      ),
    )
      .webp()
      .toBuffer();
    const original = `ai-fixtures/${randomUUID()}/original.webp`,
      key = `ai-fixtures/${randomUUID()}/medium.webp`;
    keys.push(original, key);
    await storage.put(original, bytes);
    await storage.put(key, bytes);
    const sha = createHash("sha256").update(bytes).digest("hex");
    const asset = await db.mediaAsset.create({
      data: {
        ownerId: f.ownerId,
        kind: "IMAGE",
        status: "READY",
        storageKey: original,
        mimeType: "image/webp",
        byteSize: BigInt(bytes.length),
        checksumSha256: sha,
        originalFileName: "owned-ceramic.webp",
        width: 640,
        height: 480,
      },
    });
    assetId = asset.id;
    await db.mediaVariant.create({
      data: {
        assetId: asset.id,
        name: "MEDIUM",
        storageKey: key,
        mimeType: "image/webp",
        byteSize: BigInt(bytes.length),
        checksumSha256: sha,
        width: 640,
        height: 480,
      },
    });
    const link = await db.mediaLink.create({
      data: {
        itemId: f.itemId,
        assetId: asset.id,
        ownerId: f.ownerId,
        purpose: "GALLERY",
        position: 0,
      },
    });
    const field = await db.customFieldDefinition.create({
      data: {
        collectionId: f.collectionId,
        name: "Maker",
        normalizedName: "maker",
        type: "SHORT_TEXT",
      },
    });
    const service = createAIAnalysisService(db, {
      providerId: "openai",
      model: "fixture-vision",
      monthlyRequestLimit: 3,
    });
    const analysis = {
      categoryKey: null,
      title: "Green ceramic vase",
      manufacturer: "Visible workshop",
      seriesOrSet: null,
      year: 2020,
      identifiers: [{ type: "MARKING", value: "A-100" }],
      catalogCandidates: [],
      warnings: ["Visible evidence only. Please check the markings yourself."],
    };
    let jobId: string | null = null;
    if (ready) {
      const job = await service.requestItemAnalysis(
        { userId: f.ownerId },
        f.itemId,
        [asset.id],
        randomUUID(),
      );
      jobId = job.id;
      const claim = await service.claimAnalysis(job.id);
      await service.storeAnalysisResult(claim!, analysis, { inputTokens: 12, outputTokens: 5 });
    }
    return { ...f, asset, link, field, analysis, service, storage, bytes, jobId, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  }
}
