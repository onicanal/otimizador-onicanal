import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "ENCRYPTION_KEY ausente. Defina uma chave hex de 64 caracteres em .env."
    );
  }
  if (raw.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY deve ter 64 caracteres hex (32 bytes). Gere com: openssl rand -hex 32"
    );
  }
  return Buffer.from(raw, "hex");
}

export interface EncryptedPayload {
  cipher: string; // base64
  iv: string; // base64
  tag: string; // base64
}

export function encryptString(plain: string): EncryptedPayload {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    cipher: enc.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptString(payload: EncryptedPayload): string {
  const key = getKey();
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const enc = Buffer.from(payload.cipher, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

export function maskToken(token: string | null | undefined): string {
  if (!token) return "";
  if (token.length <= 8) return "•".repeat(token.length);
  return `${token.slice(0, 4)}${"•".repeat(Math.max(0, token.length - 8))}${token.slice(-4)}`;
}
