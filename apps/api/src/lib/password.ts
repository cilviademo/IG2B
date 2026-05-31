import { scrypt, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const dk = (await scryptAsync(pw, salt, 64)) as Buffer;
  return `${salt.toString("hex")}:${dk.toString("hex")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [s, h] = stored.split(":");
  if (!s || !h) return false;
  const dk = (await scryptAsync(pw, Buffer.from(s, "hex"), 64)) as Buffer;
  const hb = Buffer.from(h, "hex");
  return hb.length === dk.length && timingSafeEqual(hb, dk);
}
