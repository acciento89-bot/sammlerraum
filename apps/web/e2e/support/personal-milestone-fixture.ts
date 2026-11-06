import type { Page } from "@playwright/test";
import {
  PersonalMilestoneDtoSchema,
  type PersonalMilestoneDto,
} from "@sammlerraum/contracts/personal-milestones";
import { searchFixture, cleanupSearchFixture, origin } from "./search-fixture";
export async function personalMilestoneFixture(
  page: Page,
  initial: Array<{ title: string; milestoneDate: string }> = [],
) {
  const base = await searchFixture();
  const f = { ...base, milestones: [] as PersonalMilestoneDto[] };
  try {
    const signed = await page.request.post("/api/auth/sign-in/email", {
      headers: { origin, "x-forwarded-for": f.ip },
      data: { email: f.email, password: f.password },
    });
    if (signed.status() !== 200) throw Error("Synthetic fixture sign-in failed");
    for (const input of initial) {
      const response = await page.request.post("/api/v1/dashboard/milestones", {
        headers: { origin },
        data: input,
      });
      if (response.status() !== 201) throw Error("Actual milestone fixture creation failed");
      f.milestones.push(PersonalMilestoneDtoSchema.parse(await response.json()));
    }
    return f;
  } catch (error) {
    await cleanupSearchFixture(f);
    throw error;
  }
}
export const cleanupPersonalMilestoneFixture = cleanupSearchFixture;
