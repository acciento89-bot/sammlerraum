import { StorageLocationSchema, type LocationContents } from "@sammlerraum/contracts/locations";

import { createLocationService, type LocationDatabase } from "./location-service";

const tokenPattern = /^[A-Za-z0-9_-]{43}$/;

export class LabelNotFoundError extends Error {
  readonly code = "NOT_FOUND";
  constructor() {
    super("Location not found");
  }
}

export type LabelDatabase = LocationDatabase & {
  storageLocation: {
    findFirst(args: {
      where: { ownerId: string; qrToken: string };
      select: { id: true };
    }): Promise<{ id: string } | null>;
  };
};

export function createLabelService(
  database: LabelDatabase,
  actorUserId: string | null,
  appOrigin: string,
) {
  async function resolveLabelToken(token: string): Promise<{ locationId: string }> {
    if (!actorUserId || !tokenPattern.test(token)) throw new LabelNotFoundError();
    const location = await database.storageLocation.findFirst({
      where: { ownerId: actorUserId, qrToken: token },
      select: { id: true },
    });
    if (!location) throw new LabelNotFoundError();
    return { locationId: location.id };
  }

  async function getLocationContentsForActor(locationId: string): Promise<LocationContents> {
    if (!actorUserId || !StorageLocationSchema.shape.id.safeParse(locationId).success) {
      throw new LabelNotFoundError();
    }
    try {
      return await createLocationService(database, actorUserId).getLocationContents(locationId);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "LOCATION_NOT_FOUND") {
        throw new LabelNotFoundError();
      }
      throw error;
    }
  }

  async function getPrintableLabel(locationId: string) {
    const { location } = await getLocationContentsForActor(locationId);
    const owned = StorageLocationSchema.parse(location);
    return {
      name: owned.name,
      shortCode: owned.id.slice(0, 8).toUpperCase(),
      url: `${appOrigin.replace(/\/+$/, "")}/l/${owned.qrToken}`,
    };
  }

  return { resolveLabelToken, getLocationContentsForActor, getPrintableLabel };
}
