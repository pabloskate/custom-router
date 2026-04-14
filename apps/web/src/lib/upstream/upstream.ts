import { GATEWAY_PRESETS } from "../gateway-presets";
import type { RouterRuntimeBindings } from "../infra/runtime-bindings";
import { UPSTREAM } from "../constants";

export interface UpstreamTarget {
  baseUrl: string;
  apiKey: string;
}

export interface UpstreamHostPolicy {
  allowArbitraryHosts: boolean;
  allowedHosts: ReadonlySet<string>;
}

export type UpstreamBaseUrlValidationResult =
  | {
      ok: true;
      normalized: string;
      hostname: string;
    }
  | {
      ok: false;
      code: "invalid_url" | "host_not_allowed";
      hostname?: string;
    };

export type ResolveUpstreamResult =
  | {
    ok: true;
    value: UpstreamTarget;
  }
  | {
    ok: false;
    status: 400 | 500;
    error: string;
  };

export type UpstreamCallResult =
  | {
    ok: true;
    status: number;
    response: Response;
  }
  | {
    ok: false;
    status: number;
    errorBody: string;
  };

function cleanOptional(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : null;
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function parseValidatedBaseUrl(baseUrl: string): URL | null {
  try {
    const parsed = new URL(baseUrl);
    if (parsed.protocol !== "https:") {
      return null;
    }
    if (parsed.username || parsed.password) {
      return null;
    }
    if (parsed.search || parsed.hash) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function normalizeAllowedHost(hostOrUrl: string): string | null {
  const trimmed = hostOrUrl.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    return /^[a-z0-9.-]+$/i.test(trimmed) ? trimmed : null;
  }
}

export function resolveUpstreamHostPolicy(
  bindings?: Pick<RouterRuntimeBindings, "UPSTREAM_ALLOWED_HOSTS" | "UPSTREAM_ALLOW_ARBITRARY_HOSTS"> | null
): UpstreamHostPolicy {
  const allowedHosts = new Set(
    GATEWAY_PRESETS.map((preset) => new URL(preset.baseUrl).hostname.toLowerCase())
  );
  const configuredHosts = bindings?.UPSTREAM_ALLOWED_HOSTS ?? "";
  for (const candidate of configuredHosts.split(UPSTREAM.ALLOWED_HOSTS_SEPARATOR)) {
    const normalized = normalizeAllowedHost(candidate);
    if (normalized) {
      allowedHosts.add(normalized);
    }
  }

  return {
    allowArbitraryHosts: bindings?.UPSTREAM_ALLOW_ARBITRARY_HOSTS === "true",
    allowedHosts,
  };
}

export function validateUpstreamBaseUrl(
  baseUrl: string,
  policy?: UpstreamHostPolicy | null
): UpstreamBaseUrlValidationResult {
  const parsed = parseValidatedBaseUrl(baseUrl);
  if (!parsed) {
    return { ok: false, code: "invalid_url" };
  }

  const hostname = parsed.hostname.toLowerCase();
  if (policy && !policy.allowArbitraryHosts && !policy.allowedHosts.has(hostname)) {
    return { ok: false, code: "host_not_allowed", hostname };
  }

  return {
    ok: true,
    normalized: normalizeBaseUrl(parsed.toString()),
    hostname,
  };
}

export function normalizeAndValidateUpstreamBaseUrl(
  baseUrl: string,
  policy?: UpstreamHostPolicy | null
): string | null {
  const result = validateUpstreamBaseUrl(baseUrl, policy);
  return result.ok ? result.normalized : null;
}

export function getUpstreamBaseUrlValidationError(args: {
  fieldLabel: string;
  result: Extract<UpstreamBaseUrlValidationResult, { ok: false }>;
}): string {
  if (args.result.code === "host_not_allowed") {
    return `This deployment does not allow ${args.fieldLabel} host "${args.result.hostname ?? "unknown"}". Add it to UPSTREAM_ALLOWED_HOSTS or set UPSTREAM_ALLOW_ARBITRARY_HOSTS=true only on trusted self-hosted instances.`;
  }

  return `Invalid ${args.fieldLabel}. Use an https URL without query/hash/embedded credentials.`;
}

function validateBaseUrl(baseUrl: string, source: "override" | "fallback"): ResolveUpstreamResult {
  const normalized = normalizeAndValidateUpstreamBaseUrl(baseUrl);
  if (!normalized) {
    return {
      ok: false,
      status: source === "override" ? 400 : 500,
      error:
        source === "override"
          ? "Invalid upstream base URL. Use a valid https URL without embedded credentials."
          : "Server misconfigured: invalid upstream base URL.",
    };
  }

  return {
    ok: true,
    value: {
      baseUrl: normalized,
      apiKey: "",
    },
  };
}

export function joinUpstreamUrl(baseUrl: string, apiPath: string): string {
  const normalizedPath = apiPath.replace(/^\/+/, "");
  return `${normalizeBaseUrl(baseUrl)}/${normalizedPath}`;
}

export function isOpenRouterHost(baseUrl: string): boolean {
  const parsed = parseValidatedBaseUrl(baseUrl);
  if (!parsed) {
    return false;
  }

  return parsed.hostname === "openrouter.ai" || parsed.hostname.endsWith(".openrouter.ai");
}

export function resolveUpstreamTarget(args: {
  baseUrlOverride?: string | null;
  apiKeyOverride?: string | null;
  fallbackBaseUrl?: string | null;
  fallbackApiKey?: string | null;
  requireApiKeyWithBaseOverride?: boolean;
}): ResolveUpstreamResult {
  const baseUrlOverride = cleanOptional(args.baseUrlOverride);
  const apiKeyOverride = cleanOptional(args.apiKeyOverride);
  const fallbackBaseUrl = cleanOptional(args.fallbackBaseUrl);
  const fallbackApiKey = cleanOptional(args.fallbackApiKey);
  const requireApiKeyWithBaseOverride = args.requireApiKeyWithBaseOverride ?? true;

  if (baseUrlOverride && requireApiKeyWithBaseOverride && !apiKeyOverride) {
    return {
      ok: false,
      status: 400,
      error: "An API key is required when a custom upstream base URL is configured.",
    };
  }

  const selectedBaseUrl = baseUrlOverride ?? fallbackBaseUrl;
  if (!selectedBaseUrl) {
    return {
      ok: false,
      status: 500,
      error: "Server misconfigured: missing upstream base URL.",
    };
  }

  const baseValidation = validateBaseUrl(selectedBaseUrl, baseUrlOverride ? "override" : "fallback");
  if (!baseValidation.ok) {
    return baseValidation;
  }

  const selectedApiKey = apiKeyOverride ?? fallbackApiKey;
  if (!selectedApiKey) {
    return {
      ok: false,
      status: 500,
      error: "No BYOK upstream API key configured for this account.",
    };
  }

  return {
    ok: true,
    value: {
      baseUrl: baseValidation.value.baseUrl,
      apiKey: selectedApiKey,
    },
  };
}

export async function callOpenAiCompatible(args: {
  apiPath: "/chat/completions" | "/responses" | "/completions";
  payload: unknown;
  apiKey: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<UpstreamCallResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${args.apiKey}`,
    "Content-Type": "application/json",
  };

  const response = await fetchImpl(joinUpstreamUrl(args.baseUrl, args.apiPath), {
    method: "POST",
    headers: requestHeaders,
    body: JSON.stringify(args.payload),
  });

  if (response.ok) {
    return {
      ok: true,
      status: response.status,
      response,
    };
  }

  return {
    ok: false,
    status: response.status,
    errorBody: await response.text(),
  };
}
