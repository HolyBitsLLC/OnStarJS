import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

import { TOTP } from "totp-generator";

import { GMAuth, MfaError, normalizeTotpSecret } from "../../src/auth/GMAuth";

const LENGTH_ERROR = /does not meet expected key length/;
const key = "JBSWY3DPEHPK3PXP";

describe("normalizeTotpSecret", () => {
  test("accepts a bare base32 key", () => {
    expect(normalizeTotpSecret(key)).toBe(key);
  });

  test("uppercases a lowercase key", () => {
    expect(normalizeTotpSecret(key.toLowerCase())).toBe(key);
  });

  test("strips spaces and dashes", () => {
    expect(normalizeTotpSecret("JBSW Y3DP-EHPK 3PXP")).toBe(key);
  });

  test("strips base32 padding", () => {
    expect(normalizeTotpSecret(`${key}====`)).toBe(key);
  });

  test("extracts secret= when followed by another query parameter", () => {
    expect(
      normalizeTotpSecret(
        `otpauth://totp/GM:user@example.com?secret=${key}&issuer=GM`,
      ),
    ).toBe(key);
  });

  test("extracts secret= when it is the LAST query parameter (regression)", () => {
    // Vaultwarden renders `?secret=<key>` last. The old `secret=(.*?)&`
    // pattern captured nothing here and then failed the length check against
    // the whole URI.
    expect(
      normalizeTotpSecret(
        `otpauth://totp/GM:user@example.com?issuer=GM&secret=${key}`,
      ),
    ).toBe(key);
  });

  test("accepts an otpauth:// URI with no other query parameters", () => {
    expect(
      normalizeTotpSecret(`otpauth://totp/GM:user@example.com?secret=${key}`),
    ).toBe(key);
  });

  test("decodes a URL-encoded padded secret", () => {
    expect(normalizeTotpSecret(`otpauth://totp/x?secret=${key}%3D%3D`)).toBe(
      key,
    );
  });

  test("rejects a rotating 6-digit code", () => {
    expect(() => normalizeTotpSecret("123456")).toThrow(LENGTH_ERROR);
  });

  test("rejects the seed-only sentinel used by the token-cache gate", () => {
    expect(() => normalizeTotpSecret("NO-TOTP-SEED-ONLY")).toThrow(
      LENGTH_ERROR,
    );
  });

  test("rejects an empty value", () => {
    expect(() => normalizeTotpSecret(undefined)).toThrow(LENGTH_ERROR);
  });
});

describe("MfaError", () => {
  test("carries its name and cause so the retry loop can identify it", () => {
    const cause = new Error("boom");
    const error = new MfaError("mfa failed", { cause });
    expect(error.name).toBe("MfaError");
    expect(error.message).toBe("mfa failed");
    expect((error as { cause?: unknown }).cause).toBe(cause);
  });
});

describe("generateMfaCode", () => {
  const OTP = "928374";

  const makeAuth = (totpKey: string) =>
    new GMAuth({
      username: "user@example.com",
      password: "dummy-password",
      deviceId: "00000000-0000-0000-0000-000000000000",
      totpKey,
      tokenLocation: mkdtempSync(join(tmpdir(), "onstarjs-mfa-")),
    });

  // The MFA code is a live second factor for ~30 seconds. It must never reach
  // stdout, a log handler, or an exception message — only the input field.
  test("never writes the generated OTP to any console channel", async () => {
    jest
      .spyOn(TOTP, "generate")
      .mockResolvedValue({ otp: OTP, expires: Date.now() + 30000 });

    const auth = makeAuth(key);
    const channels = [
      "log",
      "info",
      "debug",
      "warn",
      "error",
      "trace",
    ] as const;
    const spies = channels.map((channel) =>
      jest.spyOn(console, channel).mockImplementation(() => undefined),
    );

    const code = await (
      auth as unknown as { generateMfaCode(): Promise<string> }
    ).generateMfaCode();

    expect(code).toBe(OTP);

    const logged = spies
      .flatMap((spy) => spy.mock.calls)
      .flat()
      .join(" ");
    expect(logged).not.toContain(OTP);
    expect(logged).toMatch(/value withheld from logs/i);
  });

  test("normalises an otpauth:// URI whose secret is the last parameter", async () => {
    const generate = jest
      .spyOn(TOTP, "generate")
      .mockResolvedValue({ otp: OTP, expires: Date.now() + 30000 });

    const auth = makeAuth(
      `otpauth://totp/GM:user@example.com?issuer=GM&secret=${key}`,
    );

    await (
      auth as unknown as { generateMfaCode(): Promise<string> }
    ).generateMfaCode();

    // Proves the URI was parsed down to the bare base32 seed before generation;
    // the unpatched `secret=(.*?)&` regex passed the whole URI through here.
    expect(generate).toHaveBeenCalledWith(
      key,
      expect.objectContaining({ digits: 6, algorithm: "SHA-1", period: 30 }),
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
