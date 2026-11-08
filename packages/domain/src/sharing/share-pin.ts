import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { ShareError } from "@sammlerraum/contracts/sharing";

// Both the persistent per-grant budget and this process-wide cap precede costly work.
let activeDerivations = 0;
async function derive(pin: string, salt: Buffer): Promise<Buffer> {
  if (activeDerivations >= 4) throw new ShareError("SHARE_RATE_LIMITED");
  activeDerivations++;
  try {
    return await new Promise<Buffer>((resolve, reject) => {
      scrypt(pin, salt, 32, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }, (error, result) =>
        error ? reject(error) : resolve(result),
      );
    });
  } finally {
    activeDerivations--;
  }
}
export async function hashSharePin(pin: string) {
  const salt = randomBytes(16),
    key = await derive(pin, salt);
  return `scrypt$16384$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}
export async function verifySharePin(pin: string, encoded: string) {
  const match = /^scrypt\$16384\$8\$1\$([0-9a-f]{32})\$([0-9a-f]{64})$/.exec(encoded);
  if (!match) throw new ShareError("SHARE_INTEGRITY");
  return timingSafeEqual(
    await derive(pin, Buffer.from(match[1]!, "hex")),
    Buffer.from(match[2]!, "hex"),
  );
}
