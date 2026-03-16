// ─────────────────────────────────────────────────────────────────────────────
// auth.ts
//
// All authentication primitives for the web app. Three independent concerns:
//
//   API key auth    — generateApiKey / hashKey / authenticateRequest
//                     Used by external callers (curl, SDKs, agents).
//                     Key format: ar_sk_<32 hex bytes>
//
//   Session auth    — createSession / authenticateSession / buildSessionCookie
//                     Used by the browser UI. HttpOnly cookie, 30-day TTL.
//
//   Password auth   — hashPassword / verifyPassword
//                     PBKDF2-SHA256 with per-user salt stored in D1.
//
// All string comparisons that touch secrets use constantTimeEqual() to prevent
// timing attacks.
//
// Magic numbers (iterations, TTLs, prefixes) live in constants.ts.
// ─────────────────────────────────────────────────────────────────────────────

import type { D1Database } from "../infra/cloudflare-types";
import { AUTH } from "../constants";
import { ensureUserUpstreamCredentialsTable } from "./user-upstream-store";
import { mergeLegacyRoutingInstructions } from "../routing/profile-config";

// Alias constants so the rest of the file reads naturally
const SESSION_COOKIE_NAME = AUTH.SESSION_COOKIE_NAME;
const SESSION_TTL_MS = AUTH.SESSION_TTL_MS;
const SESSION_MAX_AGE_SECONDS = AUTH.SESSION_MAX_AGE_SECONDS;

export function generateApiKey(): { raw: string; hash: string; prefix: string } {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    const raw = `${AUTH.API_KEY_PREFIX}${hex}`;
    const prefix = raw.slice(0, AUTH.API_KEY_DISPLAY_PREFIX_LENGTH);
    // hash will be computed async
    return { raw, hash: "", prefix };
}

export async function hashKey(raw: string): Promise<string> {
    const data = new TextEncoder().encode(raw);
    const digest = await crypto.subtle.digest("SHA-256", data);
    return Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
}

// ── Auth result ──

export interface AuthResult {
    userId: string;
    userName: string;
    preferredModels: string[] | null;
    defaultModel: string | null;
    classifierModel: string | null;
    routingInstructions: string | null;
    blocklist: string[] | null;
    customCatalog: any[] | null;
    profiles: any[] | null;  // RouterProfile[] — named routing configurations
    routeTriggerKeywords: string[] | null;
    routingFrequency: string | null;
    smartPinTurns: number | null;
    upstreamBaseUrl: string | null;
    upstreamApiKeyEnc: string | null;
    classifierBaseUrl: string | null;
    classifierApiKeyEnc: string | null;
}

interface AuthRow {
    user_id: string;
    name: string;
    preferred_models: string | null;
    default_model: string | null;
    classifier_model: string | null;
    routing_instructions: string | null;
    blocklist: string | null;
    custom_catalog: string | null;
    profiles: string | null;
    route_trigger_keywords: string | null;
    routing_frequency: string | null;
    smart_pin_turns: number | null;
    upstream_base_url: string | null;
    upstream_api_key_enc: string | null;
    classifier_base_url: string | null;
    classifier_api_key_enc: string | null;
}

interface TableInfoRow {
    name?: string | null;
}

const usersSmartPinTurnsColumnCache = new WeakMap<D1Database, Promise<boolean>>();

function parseJsonArray(value: string | null): any[] | null {
    if (!value) {
        return null;
    }

    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function parseStringArray(value: string | null): string[] | null {
    const parsed = parseJsonArray(value);
    if (!parsed) {
        return null;
    }

    const strings = parsed.filter((item): item is string => typeof item === "string");
    return strings.length === parsed.length ? strings : null;
}

function rowToAuthResult(row: AuthRow): AuthResult {
    const profiles = mergeLegacyRoutingInstructions({
        profiles: parseJsonArray(row.profiles),
        routingInstructions: row.routing_instructions,
    });

    return {
        userId: row.user_id,
        userName: row.name,
        preferredModels: parseStringArray(row.preferred_models),
        defaultModel: row.default_model,
        classifierModel: row.classifier_model,
        routingInstructions: null,
        blocklist: parseStringArray(row.blocklist),
        customCatalog: parseJsonArray(row.custom_catalog),
        profiles,
        routeTriggerKeywords: parseStringArray(row.route_trigger_keywords),
        routingFrequency: row.routing_frequency,
        smartPinTurns: typeof row.smart_pin_turns === "number" ? row.smart_pin_turns : null,
        upstreamBaseUrl: row.upstream_base_url,
        upstreamApiKeyEnc: row.upstream_api_key_enc,
        classifierBaseUrl: row.classifier_base_url,
        classifierApiKeyEnc: row.classifier_api_key_enc,
    };
}

export function hasUsersSmartPinTurnsColumn(db: D1Database): Promise<boolean> {
    const cached = usersSmartPinTurnsColumnCache.get(db);
    if (cached) {
        return cached;
    }

    const lookup = db
        .prepare("PRAGMA table_info(users)")
        .all<TableInfoRow>()
        .then(({ results }) => results.some((column) => column.name === "smart_pin_turns"))
        .catch(() => false);

    usersSmartPinTurnsColumnCache.set(db, lookup);
    return lookup;
}

function buildAuthSelectQuery(includeSmartPinTurns: boolean): string {
    const smartPinTurnsSelect = includeSmartPinTurns ? "u.smart_pin_turns" : "NULL AS smart_pin_turns";

    return `
        SELECT ak.user_id, u.name, u.preferred_models, u.default_model, u.classifier_model, u.routing_instructions, u.blocklist, u.custom_catalog, u.profiles,
               u.route_trigger_keywords, u.routing_frequency, ${smartPinTurnsSelect},
               uc.upstream_base_url, uc.upstream_api_key_enc, uc.classifier_base_url, uc.classifier_api_key_enc
        FROM api_keys ak
        JOIN users u ON u.id = ak.user_id
        LEFT JOIN user_upstream_credentials uc ON uc.user_id = u.id
        WHERE ak.key_hash = ?1 AND ak.revoked_at IS NULL
        LIMIT 1
    `;
}

function buildSessionSelectQuery(includeSmartPinTurns: boolean): string {
    const smartPinTurnsSelect = includeSmartPinTurns ? "u.smart_pin_turns" : "NULL AS smart_pin_turns";

    return `
        SELECT s.user_id, u.name, u.preferred_models, u.default_model, u.classifier_model, u.routing_instructions, u.blocklist, u.custom_catalog, u.profiles,
               u.route_trigger_keywords, u.routing_frequency, ${smartPinTurnsSelect},
               uc.upstream_base_url, uc.upstream_api_key_enc, uc.classifier_base_url, uc.classifier_api_key_enc
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        LEFT JOIN user_upstream_credentials uc ON uc.user_id = u.id
        WHERE s.id = ?1 AND s.expires_at > ?2
        LIMIT 1
    `;
}

function extractBearerToken(request: Request): string | null {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
        return null;
    }

    const token = authHeader.slice(7).trim();
    return token || null;
}

function parseCookie(cookieHeader: string | null): Record<string, string> {
    if (!cookieHeader) {
        return {};
    }

    return cookieHeader.split(";").reduce<Record<string, string>>((acc, pair) => {
        const [rawKey, ...rawValue] = pair.trim().split("=");
        if (!rawKey || rawValue.length === 0) {
            return acc;
        }

        try {
            acc[rawKey] = decodeURIComponent(rawValue.join("="));
        } catch {
            acc[rawKey] = rawValue.join("=");
        }

        return acc;
    }, {});
}

export function constantTimeEqual(left: string, right: string): boolean {
    const encoder = new TextEncoder();
    const leftBytes = encoder.encode(left);
    const rightBytes = encoder.encode(right);
    const maxLength = Math.max(leftBytes.length, rightBytes.length);

    let diff = leftBytes.length ^ rightBytes.length;
    for (let index = 0; index < maxLength; index += 1) {
        diff |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
    }

    return diff === 0;
}

export function getSessionTokenFromRequest(request: Request): string | null {
    const fromBearer = extractBearerToken(request);
    if (fromBearer) {
        return fromBearer;
    }

    const cookies = parseCookie(request.headers.get("cookie"));
    const fromCookie = cookies[SESSION_COOKIE_NAME];
    return fromCookie || null;
}

export function buildSessionCookie(sessionToken: string, args: { secure: boolean; clear?: boolean }): string {
    const clear = args.clear === true;
    const expires = clear
        ? "Thu, 01 Jan 1970 00:00:00 GMT"
        : new Date(Date.now() + SESSION_TTL_MS).toUTCString();
    const maxAge = clear ? 0 : SESSION_MAX_AGE_SECONDS;
    const value = clear ? "" : encodeURIComponent(sessionToken);

    return [
        `${SESSION_COOKIE_NAME}=${value}`,
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        `Max-Age=${maxAge}`,
        `Expires=${expires}`,
        args.secure ? "Secure" : ""
    ]
        .filter(Boolean)
        .join("; ");
}

export function shouldUseSecureCookies(setting?: string): boolean {
    if (setting === "true") {
        return true;
    }
    if (setting === "false") {
        return false;
    }

    return process.env.NODE_ENV === "production";
}

// ── Authenticate a request ──

export async function authenticateRequest(
    request: Request,
    db: D1Database
): Promise<AuthResult | null> {
    const rawKey = extractBearerToken(request);
    if (!rawKey) {
        return null;
    }

    const keyHash = await hashKey(rawKey);

    await ensureUserUpstreamCredentialsTable(db);
    const includeSmartPinTurns = await hasUsersSmartPinTurnsColumn(db);

    const row = await db
        .prepare(buildAuthSelectQuery(includeSmartPinTurns))
        .bind(keyHash)
        .first<AuthRow>();

    if (!row) {
        return null;
    }

    return rowToAuthResult(row);
}

// ── Admin secret check ──

export function verifyAdminSecret(request: Request, adminSecret: string): boolean {
    const fromBearer = extractBearerToken(request);
    const fromHeader = request.headers.get("x-admin-secret")?.trim() || null;
    const candidate = fromHeader ?? fromBearer;
    if (!candidate) {
        return false;
    }

    return constantTimeEqual(candidate, adminSecret);
}

// ── Passwords ──

export async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
    const encoder = new TextEncoder();

    let saltArray: Uint8Array;
    if (saltHex) {
        saltArray = new Uint8Array(saltHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    } else {
        saltArray = new Uint8Array(16);
        crypto.getRandomValues(saltArray);
    }

    const keyMaterial = await crypto.subtle.importKey(
        "raw",
        encoder.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveBits", "deriveKey"]
    );

    const key = await crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt: saltArray.buffer as BufferSource,
            iterations: AUTH.PBKDF2_ITERATIONS,
            hash: "SHA-256"
        },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );

    const exportedKey = await crypto.subtle.exportKey("raw", key);
    const hashHex = Array.from(new Uint8Array(exportedKey))
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

    const finalSaltHex = Array.from(saltArray)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

    return { hash: hashHex, salt: finalSaltHex };
}

export async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
    const { hash } = await hashPassword(password, storedSalt);
    return constantTimeEqual(hash, storedHash);
}

// ── Sessions ──

export async function createSession(userId: string, db: D1Database): Promise<string> {
    const sessionTokenBytes = new Uint8Array(32);
    crypto.getRandomValues(sessionTokenBytes);
    const sessionToken = Array.from(sessionTokenBytes)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
    const sessionTokenHash = await hashKey(sessionToken);

    // 30 days expiry
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
    const createdAt = new Date().toISOString();

    await db.prepare("INSERT INTO user_sessions (id, user_id, expires_at, created_at) VALUES (?1, ?2, ?3, ?4)")
        .bind(sessionTokenHash, userId, expiresAt, createdAt)
        .run();

    return sessionToken;
}

export async function authenticateSession(request: Request, db: D1Database): Promise<AuthResult | null> {
    const sessionToken = getSessionTokenFromRequest(request);
    if (!sessionToken) {
        return null;
    }
    const sessionTokenHash = await hashKey(sessionToken);
    await ensureUserUpstreamCredentialsTable(db);
    const includeSmartPinTurns = await hasUsersSmartPinTurnsColumn(db);

    const now = new Date().toISOString();

    const row = await db.prepare(buildSessionSelectQuery(includeSmartPinTurns)).bind(sessionTokenHash, now).first<AuthRow>();

    if (!row) {
        return null;
    }

    return rowToAuthResult(row);
}
