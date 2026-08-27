"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { settings, users } from "@odovi/db";
import { db } from "../db";
import { hashPassword, verifyPassword } from "./password";
import { createSession, destroySession, validateSession } from "./session";
import { usersTableIsEmpty } from "./bootstrapState";
import { setupTokenFingerprint, verifySetupToken } from "./setupToken";

const ADMIN_USERNAME = "admin";
const SETUP_TOKEN_SETTING_KEY = "admin_setup_token";

// In-memory rate limit: max 5 failed attempts per 15 minutes. Keyed by a
// constant (single-user app). Module-level Map survives across requests within
// a server process.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const failedAttempts = new Map<string, number[]>();

function isRateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (failedAttempts.get(key) ?? []).filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  failedAttempts.set(key, hits);
  return hits.length >= RATE_LIMIT_MAX;
}

function recordFailure(key: string): void {
  const hits = failedAttempts.get(key) ?? [];
  hits.push(Date.now());
  failedAttempts.set(key, hits);
}

function clearFailures(key: string): void {
  failedAttempts.delete(key);
}

type AuthT = Awaited<ReturnType<typeof getTranslations>>;

function passwordSchema(t: AuthT) {
  return z.string().min(8, t("passwordMinLength"));
}

// Bootstrap braucht ein zweites "Passwort wiederholen"-Feld: Passwortmanager
// haben das einzelne Feld beim Ersteinrichten teils falsch befüllt. Serverseitig
// hier gegengeprüft, clientseitig zusätzlich in LoginForm.tsx (freundlicher
// Fehler vor Submit).
function bootstrapPasswordSchema(t: AuthT) {
  return z
    .object({
      password: passwordSchema(t),
      passwordRepeat: z.string(),
    })
    .refine((v) => v.password === v.passwordRepeat, {
      message: t("passwordMismatch"),
      path: ["passwordRepeat"],
    });
}

export interface AuthResult {
  error?: string;
}

/**
 * Bootstrap action: creates the single admin user with the chosen password,
 * then logs in. Only valid while the users table is empty.
 */
export async function bootstrapAdmin(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const t = await getTranslations("auth");

  if (!(await usersTableIsEmpty())) {
    return { error: t("userAlreadyExists") };
  }

  const parsed = bootstrapPasswordSchema(t).safeParse({
    password: formData.get("password"),
    passwordRepeat: formData.get("passwordRepeat"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("invalidPassword") };
  }

  const configuredToken = process.env.ODOVI_SETUP_TOKEN;
  if (!verifySetupToken(configuredToken, formData.get("setupToken"))) {
    return { error: t("invalidSetupToken") };
  }

  const fingerprint = setupTokenFingerprint(configuredToken!);
  const consumed = await db
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, SETUP_TOKEN_SETTING_KEY))
    .limit(1);
  if (
    (consumed[0]?.value as { fingerprint?: unknown } | undefined)?.fingerprint === fingerprint
  ) {
    return { error: t("invalidSetupToken") };
  }

  const passwordHash = await hashPassword(parsed.data.password);
  const inserted = await db.transaction(async (tx) => {
    const rows = await tx
      .insert(users)
      .values({ username: ADMIN_USERNAME, passwordHash })
      .onConflictDoNothing()
      .returning({ id: users.id });
    if (!rows[0]) return rows;

    const value = { fingerprint, consumedAt: new Date().toISOString() };
    await tx
      .insert(settings)
      .values({ key: SETUP_TOKEN_SETTING_KEY, value })
      .onConflictDoUpdate({
        target: settings.key,
        set: { value, updatedAt: new Date() },
      });
    return rows;
  });

  const userId = inserted[0]?.id;
  if (!userId) {
    return { error: t("userCreationFailed") };
  }

  await createSession(userId);
  redirect("/");
}

/**
 * Normal login: password-only (username fixed to 'admin'). Rate-limited.
 */
export async function login(
  _prev: AuthResult,
  formData: FormData,
): Promise<AuthResult> {
  const t = await getTranslations("auth");

  const rateKey = ADMIN_USERNAME;
  if (isRateLimited(rateKey)) {
    return { error: t("tooManyAttempts") };
  }

  const parsed = passwordSchema(t).safeParse(formData.get("password"));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("invalidPassword") };
  }

  const rows = await db
    .select({ id: users.id, passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.username, ADMIN_USERNAME))
    .limit(1);

  const user = rows[0];
  const ok = user
    ? await verifyPassword(user.passwordHash, parsed.data)
    : false;

  if (!ok || !user) {
    recordFailure(rateKey);
    return { error: t("wrongPassword") };
  }

  clearFailures(rateKey);
  await createSession(user.id);
  redirect("/");
}

/** Logout: destroys the session and returns to the login page. */
export async function logout(): Promise<void> {
  if (!(await validateSession())) {
    redirect("/login");
  }
  await destroySession();
  redirect("/login");
}
