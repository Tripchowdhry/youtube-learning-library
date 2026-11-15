import { describe, expect, it } from "vitest";
import { decrypt, deriveKey, encrypt, isRightKey, makeCheckValue, newSalt } from "@/lib/vault-crypto";

// Fewer rounds than the real Vault so the test runs fast; the steps are the same.
const ROUNDS = 1000;

describe("Vault encryption", () => {
  it("opens with the right passphrase and keeps the secret", async () => {
    const salt = newSalt();
    const key = await deriveKey("correct horse battery staple", salt, ROUNDS);
    const stored = await encrypt(key, "my-secret-api-key ✓", "entry-1:password");
    expect(stored).not.toContain("my-secret");
    expect(await decrypt(key, stored, "entry-1:password")).toBe("my-secret-api-key ✓");
  });

  it("says no to a wrong passphrase", async () => {
    const salt = newSalt();
    const check = await makeCheckValue(await deriveKey("correct horse battery staple", salt, ROUNDS));
    expect(await isRightKey(await deriveKey("correct horse battery staple", salt, ROUNDS), check)).toBe(true);
    expect(await isRightKey(await deriveKey("wrong horse battery staple", salt, ROUNDS), check)).toBe(false);
  });

  it("won't open a secret moved to another entry or field", async () => {
    const key = await deriveKey("correct horse battery staple", newSalt(), ROUNDS);
    const stored = await encrypt(key, "secret", "entry-1:password");
    await expect(decrypt(key, stored, "entry-2:password")).rejects.toThrow();
  });
});
