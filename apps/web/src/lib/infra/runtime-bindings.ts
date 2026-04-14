// ─────────────────────────────────────────────────────────────────────────────
// runtime-bindings.ts
//
// Reads Cloudflare Worker environment bindings and normalises them into a
// typed RouterRuntimeBindings object.
//
// Priority order for each value:
//   1. Cloudflare context via getCloudflareContext() (OpenNext v3)
//   2. globalThis.cloudflare.env (some OpenNext versions)
//   3. process.env (local dev fallback)
//
// Call getRuntimeBindings() at the top of any route handler.
// Required / optional bindings are documented in .env.example.
// ─────────────────────────────────────────────────────────────────────────────

import type { D1Database, KVNamespace } from "./cloudflare-types";

export interface RouterRuntimeBindings {
  ROUTER_DB?: D1Database;
  ROUTER_KV?: KVNamespace;
  BYOK_ENCRYPTION_SECRET?: string;
  ROUTER_CLASSIFIER_MODEL?: string;
  UPSTREAM_ALLOWED_HOSTS?: string;
  UPSTREAM_ALLOW_ARBITRARY_HOSTS?: string;
  ADMIN_SECRET?: string;
  SESSION_COOKIE_SECURE?: string;
  REGISTRATION_MODE?: string;
  RESEND_API_KEY?: string;
  PASSWORD_RESET_FROM_EMAIL?: string;
  PASSWORD_RESET_BASE_URL?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var CUSTOM_ROUTER_BINDINGS: RouterRuntimeBindings | undefined;
}

export function getRuntimeBindings(): RouterRuntimeBindings {
  let fromGlobal: any = globalThis.CUSTOM_ROUTER_BINDINGS;

  // Next.js 15 / OpenNext v3 cloudflare context bindings
  try {
    const { getCloudflareContext } = require("@opennextjs/cloudflare");
    const ctx = getCloudflareContext();
    if (ctx && ctx.env) {
      fromGlobal = ctx.env;
    }
  } catch (e) {
    // try fallback
  }

  if (!fromGlobal?.ROUTER_KV) {
    // Fallback: sometimes injected to globalThis.cloudflare
    const cf = (globalThis as any).cloudflare;
    if (cf && cf.env) {
      fromGlobal = cf.env;
    }
  }

  return {
    ROUTER_DB: fromGlobal?.ROUTER_DB,
    ROUTER_KV: fromGlobal?.ROUTER_KV,
    BYOK_ENCRYPTION_SECRET:
      fromGlobal?.BYOK_ENCRYPTION_SECRET ?? process.env.BYOK_ENCRYPTION_SECRET,
    ROUTER_CLASSIFIER_MODEL:
      fromGlobal?.ROUTER_CLASSIFIER_MODEL ?? process.env.ROUTER_CLASSIFIER_MODEL,
    UPSTREAM_ALLOWED_HOSTS:
      fromGlobal?.UPSTREAM_ALLOWED_HOSTS ?? process.env.UPSTREAM_ALLOWED_HOSTS,
    UPSTREAM_ALLOW_ARBITRARY_HOSTS:
      fromGlobal?.UPSTREAM_ALLOW_ARBITRARY_HOSTS ?? process.env.UPSTREAM_ALLOW_ARBITRARY_HOSTS,
    ADMIN_SECRET:
      fromGlobal?.ADMIN_SECRET ?? process.env.ADMIN_SECRET,
    SESSION_COOKIE_SECURE:
      fromGlobal?.SESSION_COOKIE_SECURE ?? process.env.SESSION_COOKIE_SECURE,
    REGISTRATION_MODE:
      fromGlobal?.REGISTRATION_MODE ?? process.env.REGISTRATION_MODE,
    RESEND_API_KEY:
      fromGlobal?.RESEND_API_KEY ?? process.env.RESEND_API_KEY,
    PASSWORD_RESET_FROM_EMAIL:
      fromGlobal?.PASSWORD_RESET_FROM_EMAIL ?? process.env.PASSWORD_RESET_FROM_EMAIL,
    PASSWORD_RESET_BASE_URL:
      fromGlobal?.PASSWORD_RESET_BASE_URL ?? process.env.PASSWORD_RESET_BASE_URL,
  };
}
