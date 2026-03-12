import { UPSTREAM } from "./constants";

export interface UpstreamTarget {
  baseUrl: string;
  apiKey: string;
}

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

export function normalizeAndValidateUpstreamBaseUrl(baseUrl: string): string | null {
  const parsed = parseValidatedBaseUrl(baseUrl);
  return parsed ? normalizeBaseUrl(parsed.toString()) : null;
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
  requestId: string;
  baseUrl: string;
  fetchImpl?: typeof fetch;
}): Promise<UpstreamCallResult> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const requestHeaders: Record<string, string> = {
    Authorization: `Bearer ${args.apiKey}`,
    "Content-Type": "application/json",
    [UPSTREAM.REQUEST_ID_HEADER]: args.requestId,
  };

  if (isOpenRouterHost(args.baseUrl)) {
    requestHeaders[UPSTREAM.OPENROUTER_TITLE_HEADER] = UPSTREAM.OPENROUTER_TITLE_VALUE;
  }

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
