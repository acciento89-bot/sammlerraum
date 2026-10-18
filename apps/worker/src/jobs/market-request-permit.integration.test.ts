import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDatabaseClient } from "@sammlerraum/db/test-database";
import { credentialKey } from "@sammlerraum/market-data/provider-http";
import { ProviderFailure } from "@sammlerraum/market-data/provider-failure";
import {
  createPostgresMarketGate,
  createMarketRequestPermit,
  type MarketGateStore,
} from "./market-request-permit";
const enabled = process.env.RUN_DATABASE_INTEGRATION === "1";
const a = enabled ? createTestDatabaseClient() : undefined,
  b = enabled ? createTestDatabaseClient() : undefined;
const keys: string[] = [];
const signal = () => new AbortController().signal;
function fixture(hourly = 60, daily = 500) {
  const key = credentialKey("pricecharting", randomUUID());
  keys.push(key);
  const policy = { credentialKey: key, service: "pricecharting" as const, hourly, daily };
  return {
    key,
    sa: createPostgresMarketGate(a!, [policy]),
    sb: createPostgresMarketGate(b!, [policy]),
  };
}
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
};
async function row(key: string) {
  return (
    await b!.$queryRaw<
      Array<{ activeAttempt: string | null; hourCount: number; dayCount: number }>
    >`SELECT * FROM "MarketRequestGate" WHERE "credentialKey"=${key}`
  )[0]!;
}
describe.runIf(enabled)("durable market gate on separate PostgreSQL clients", () => {
  beforeAll(async () => {
    const [r] = await a!.$queryRaw<
      Array<{ name: string; version: string }>
    >`SELECT current_database() name,current_setting('server_version') version`;
    expect(r!.name.endsWith("_test")).toBe(true);
    expect(r!.version.startsWith("17.")).toBe(true);
  });
  afterAll(async () => {
    for (const key of keys)
      await a!.$executeRaw`DELETE FROM "MarketRequestGate" WHERE "credentialKey"=${key}`;
    await Promise.all([a!.$disconnect(), b!.$disconnect()]);
  });
  it("holds a paused admitted sender beyond one second, then enforces physical settlement plus cooldown", async () => {
    const { key, sa, sb } = fixture(),
      admitted = deferred(),
      resume = deferred(),
      body = deferred();
    const pa = createMarketRequestPermit({
        store: {
          ...sa,
          acquire: async (k, id) => {
            await sa.acquire(k, id);
            admitted.resolve();
            await resume.promise;
          },
        },
      }),
      pb = createMarketRequestPermit({ store: sb });
    const starts: number[] = [];
    let settled = 0;
    const first = pa.run({ credentialKey: key, signal: signal() }, async () => {
      starts.push(performance.now());
      await body.promise;
      settled = performance.now();
    });
    await admitted.promise;
    await delay(1050);
    await expect(
      pb.run({ credentialKey: key, signal: signal() }, async () => {
        starts.push(performance.now());
      }),
    ).rejects.toMatchObject({ code: "PERMIT_UNAVAILABLE" });
    expect(starts).toEqual([]);
    resume.resolve();
    await delay(10);
    body.resolve();
    await first;
    await pb.run({ credentialKey: key, signal: signal() }, async () => {
      starts.push(performance.now());
    });
    expect(starts).toHaveLength(2);
    expect(starts[1]! - settled).toBeGreaterThanOrEqual(1000);
    expect((await row(key)).dayCount).toBe(2);
    await Promise.all([pa.stop(), pb.stop()]);
  }, 10000);
  it("races concurrent first admission atomically and keeps a crashed claim non-expiring", async () => {
    const { key, sa, sb } = fixture();
    const ids = [randomUUID(), randomUUID()];
    const outcomes = await Promise.allSettled([sa.acquire(key, ids[0]!), sb.acquire(key, ids[1]!)]);
    expect(outcomes.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect((await row(key)).dayCount).toBe(1);
    await a!
      .$executeRaw`UPDATE "MarketRequestGate" SET "acquiredAt"='2000-01-01'::timestamptz WHERE "credentialKey"=${key}`;
    await expect(sb.acquire(key, randomUUID())).rejects.toMatchObject({
      code: "PERMIT_UNAVAILABLE",
    });
    expect((await row(key)).activeAttempt).not.toBeNull();
  });
  it("racing first-row permits start exactly one physical callback", async () => {
    const { key, sa, sb } = fixture();
    const body = deferred();
    let starts = 0,
      rejected = 0;
    const pa = createMarketRequestPermit({ store: sa }),
      pb = createMarketRequestPermit({ store: sb });
    const tasks = [pa, pb].map((p) =>
      p
        .run({ credentialKey: key, signal: signal() }, async () => {
          starts++;
          await body.promise;
        })
        .catch((error) => {
          expect(error).toMatchObject({ code: "PERMIT_UNAVAILABLE" });
          rejected++;
        }),
    );
    await vi.waitFor(() => {
      expect(starts).toBe(1);
      expect(rejected).toBe(1);
    });
    expect((await row(key)).dayCount).toBe(1);
    body.resolve();
    await Promise.all(tasks);
    await Promise.all([pa.stop(), pb.stop()]);
  });
  it("keeps distinct tokens independent and never refunds failure or pre-send abort", async () => {
    const x = fixture(),
      y = fixture();
    await x.sa.acquire(x.key, randomUUID());
    const py = createMarketRequestPermit({ store: y.sb });
    await expect(
      py.run({ credentialKey: y.key, signal: signal() }, async () => {
        throw Error("private");
      }),
    ).rejects.toMatchObject({ code: "TRANSPORT" });
    expect((await row(y.key)).dayCount).toBe(1);
    await py.stop();
    const z = fixture(),
      ac = new AbortController();
    const pz = createMarketRequestPermit({
      store: {
        ...z.sa,
        acquire: async (k, id) => {
          await z.sa.acquire(k, id);
          ac.abort();
        },
      },
    });
    let calls = 0;
    await expect(
      pz.run({ credentialKey: z.key, signal: ac.signal }, async () => {
        calls++;
      }),
    ).rejects.toMatchObject({ code: "INTERRUPTED" });
    expect(calls).toBe(0);
    expect((await row(z.key)).dayCount).toBe(1);
    await pz.stop();
  }, 8000);
  it("enforces hourly/daily budgets, non-regressing DB windows and policy consistency", async () => {
    for (const [hourly, daily] of [
      [1, 500],
      [60, 1],
      [0, 0],
    ] as const) {
      const { key, sa, sb } = fixture(hourly, daily);
      const pa = createMarketRequestPermit({ store: sa });
      let calls = 0;
      if (hourly > 0)
        await pa.run({ credentialKey: key, signal: signal() }, async () => {
          calls++;
        });
      await expect(
        createMarketRequestPermit({ store: sb }).run(
          { credentialKey: key, signal: signal() },
          async () => {
            calls++;
          },
        ),
      ).rejects.toBeInstanceOf(ProviderFailure);
      expect(calls).toBe(hourly ? 1 : 0);
      await pa.stop();
    }
    const { key, sa } = fixture();
    await sa.acquire(key, randomUUID());
    const active = (await row(key)).activeAttempt!;
    await sa.clear(key, active);
    await a!
      .$executeRaw`UPDATE "MarketRequestGate" SET "hourStart"="hourStart"+interval '2 hours' WHERE "credentialKey"=${key}`;
    await expect(sa.acquire(key, randomUUID())).rejects.toMatchObject({
      code: "PERMIT_UNAVAILABLE",
    });
    const other = createPostgresMarketGate(b!, [
      { credentialKey: key, service: "pricecharting", hourly: 2, daily: 5 },
    ]);
    await expect(other.acquire(key, randomUUID())).rejects.toMatchObject({
      code: "PERMIT_UNAVAILABLE",
    });
  }, 8000);
  it("never sends on admission committed/lost ACK and retains claim plus local uncertainty", async () => {
    const { key, sa, sb } = fixture();
    const p = createMarketRequestPermit({
      store: {
        ...sa,
        acquire: async (k, id) => {
          await sa.acquire(k, id);
          throw Error("lost ACK secret");
        },
      },
    });
    let sends = 0;
    await expect(
      p.run({ credentialKey: key, signal: signal() }, async () => {
        sends++;
      }),
    ).rejects.toMatchObject({ code: "PERMIT_UNCERTAIN" });
    expect(sends).toBe(0);
    expect((await row(key)).activeAttempt).not.toBeNull();
    await expect(sb.acquire(key, randomUUID())).rejects.toBeInstanceOf(ProviderFailure);
    await expect(p.stop()).rejects.toMatchObject({ code: "PERMIT_UNCERTAIN" });
  });
  it("allows safe successor after clear committed/lost ACK while old local stop fails", async () => {
    const { key, sa, sb } = fixture();
    let settled = 0;
    const p = createMarketRequestPermit({
      store: {
        ...sa,
        clear: async (k, id) => {
          await sa.clear(k, id);
          throw Error("lost clear ACK");
        },
      },
    });
    await expect(
      p.run({ credentialKey: key, signal: signal() }, async () => {
        settled = performance.now();
      }),
    ).rejects.toMatchObject({ code: "PERMIT_UNCERTAIN" });
    expect((await row(key)).activeAttempt).toBeNull();
    const next = createMarketRequestPermit({ store: sb });
    await next.run({ credentialKey: key, signal: signal() }, async () => {
      expect(performance.now() - settled).toBeGreaterThanOrEqual(1000);
    });
    await next.stop();
    await expect(p.stop()).rejects.toMatchObject({ code: "PERMIT_UNCERTAIN" });
  }, 8000);
  it("holds claim when clear fails before commit and never forgets settled handler uncertainty", async () => {
    const { key, sa, sb } = fixture();
    const p = createMarketRequestPermit({
      store: {
        ...sa,
        clear: async () => {
          throw Error("before commit");
        },
      },
    });
    await expect(
      p.run({ credentialKey: key, signal: signal() }, async () => {}),
    ).rejects.toBeInstanceOf(ProviderFailure);
    expect((await row(key)).activeAttempt).not.toBeNull();
    await expect(sb.acquire(key, randomUUID())).rejects.toBeInstanceOf(ProviderFailure);
    const stop = p.stop();
    expect(p.stop()).toBe(stop);
    await expect(stop).rejects.toMatchObject({ code: "PERMIT_UNCERTAIN" });
  });
  it("standalone stop aborts physical transport and waits settlement, cooldown and own clear", async () => {
    const { key, sa } = fixture(),
      entered = deferred(),
      settle = deferred(),
      aborted = deferred();
    const p = createMarketRequestPermit({ store: sa });
    let didSettle = 0;
    const task = p.run({ credentialKey: key, signal: signal() }, async (s) => {
      entered.resolve();
      s.addEventListener("abort", () => aborted.resolve(), { once: true });
      await settle.promise;
      didSettle = performance.now();
    });
    const outcome = expect(task).rejects.toMatchObject({ code: "INTERRUPTED" });
    await entered.promise;
    const stopped = p.stop();
    expect(p.stop()).toBe(stopped);
    await aborted.promise;
    expect((await row(key)).activeAttempt).not.toBeNull();
    settle.resolve();
    await outcome;
    await stopped;
    expect(performance.now() - didSettle).toBeGreaterThanOrEqual(1000);
    expect((await row(key)).activeAttempt).toBeNull();
    await expect(
      p.run({ credentialKey: key, signal: signal() }, async () => {}),
    ).rejects.toMatchObject({ code: "INTERRUPTED" });
  });
  it("keeps an ignored abort claimed until actual settlement rather than treating timeout as cancellation", async () => {
    const { key, sa, sb } = fixture(),
      entered = deferred(),
      settle = deferred();
    const p = createMarketRequestPermit({ store: sa });
    const task = p.run({ credentialKey: key, signal: signal() }, async () => {
      entered.resolve();
      await settle.promise;
    });
    const outcome = expect(task).rejects.toBeInstanceOf(ProviderFailure);
    await entered.promise;
    let done = false;
    const stop = p.stop().then(() => {
      done = true;
    });
    await delay(30);
    expect(done).toBe(false);
    await expect(sb.acquire(key, randomUUID())).rejects.toBeInstanceOf(ProviderFailure);
    settle.resolve();
    await outcome;
    await stop;
  });
  it("does not clear a transport whose physical cancellation is uncertain", async () => {
    const { key, sa } = fixture();
    const p = createMarketRequestPermit({ store: sa });
    await expect(
      p.run({ credentialKey: key, signal: signal() }, async () => {
        throw new ProviderFailure("TRANSPORT_UNCERTAIN");
      }),
    ).rejects.toMatchObject({ code: "PERMIT_UNCERTAIN" });
    expect((await row(key)).activeAttempt).not.toBeNull();
    await expect(p.stop()).rejects.toMatchObject({ code: "PERMIT_UNCERTAIN" });
  });
  it("charges a carried attempt into advanced UTC windows before releasing its claim", async () => {
    const { key, sa, sb } = fixture(1, 1);
    const id = randomUUID();
    await sa.acquire(key, id);
    await a!
      .$executeRaw`UPDATE "MarketRequestGate" SET "hourStart"="hourStart"-interval '1 day',"dayStart"="dayStart"-interval '1 day' WHERE "credentialKey"=${key}`;
    await sa.clear(key, id);
    const current = await row(key);
    expect(current.hourCount).toBe(1);
    expect(current.dayCount).toBe(1);
    await expect(sb.acquire(key, randomUUID())).rejects.toMatchObject({
      code: "PERMIT_UNAVAILABLE",
    });
  });
  it("hour-only carry preserves the already charged same-day count", async (context) => {
    const { key, sa, sb } = fixture(1, 5);
    const first = randomUUID();
    await sa.acquire(key, first);
    await sa.clear(key, first);
    // An actual previous hour in the current UTC day exists except during its first hour.
    const [clock] = await b!.$queryRaw<
      Array<{ hour: number }>
    >`SELECT extract(hour FROM clock_timestamp() AT TIME ZONE 'UTC')::int AS hour`;
    if (clock!.hour === 0) context.skip();
    await a!
      .$executeRaw`UPDATE "MarketRequestGate" SET "hourStart"="hourStart"-interval '1 hour',"hourCount"=0 WHERE "credentialKey"=${key}`;
    const second = randomUUID();
    await sa.acquire(key, second);
    await a!
      .$executeRaw`UPDATE "MarketRequestGate" SET "hourStart"="hourStart"-interval '1 hour' WHERE "credentialKey"=${key}`;
    await sa.clear(key, second);
    const current = await row(key);
    expect(current.hourCount).toBe(1);
    expect(current.dayCount).toBe(2);
    await expect(sb.acquire(key, randomUUID())).rejects.toMatchObject({
      code: "PERMIT_UNAVAILABLE",
    });
  });
  it("compare-clear never clears another attempt", async () => {
    const { key, sa } = fixture();
    const id = randomUUID();
    await sa.acquire(key, id);
    await expect(sa.clear(key, randomUUID())).rejects.toMatchObject({ code: "PERMIT_UNCERTAIN" });
    expect((await row(key)).activeAttempt).toBe(id);
  });
  it("native constraints reject invalid counters and incoherent active claims", async () => {
    const { key, sa } = fixture();
    const id = randomUUID();
    await sa.acquire(key, id);
    await sa.clear(key, id);
    await expect(
      a!.$executeRaw`UPDATE "MarketRequestGate" SET "hourCount"=-1 WHERE "credentialKey"=${key}`,
    ).rejects.toThrow();
    await expect(
      a!
        .$executeRaw`UPDATE "MarketRequestGate" SET "activeAttempt"=${randomUUID()}::uuid WHERE "credentialKey"=${key}`,
    ).rejects.toThrow();
  });
});
