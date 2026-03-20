function headersInitToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers) {
    return {};
  }

  if (Array.isArray(headers)) {
    return headers.reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {});
  }

  if (headers instanceof Headers) {
    const acc: Record<string, string> = {};
    headers.forEach((value, key) => {
      acc[key] = value;
    });
    return acc;
  }

  return { ...(headers as Record<string, string>) };
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = headersInitToRecord(headers);
  if (!responseHeaders["content-type"]) {
    responseHeaders["content-type"] = "application/json";
  }

  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders,
  });
}

export function jsonNoStore(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = headersInitToRecord(headers);
  if (!responseHeaders["content-type"]) {
    responseHeaders["content-type"] = "application/json";
  }
  responseHeaders["cache-control"] = "no-store";
  return new Response(JSON.stringify(data), { status, headers: responseHeaders });
}

export function attachRouterHeaders(
  response: Response,
  metadata: {
    model: string;
    catalogVersion: string;
    requestId: string;
    degraded: boolean;
    confidence?: number;
  }
): Response {
  const nextHeaders = new Headers(response.headers);
  nextHeaders.set("x-router-model-selected", metadata.model);
  nextHeaders.set("x-router-score-version", metadata.catalogVersion);
  nextHeaders.set("x-router-request-id", metadata.requestId);

  if (metadata.degraded) {
    nextHeaders.set("x-router-degraded", "true");
  } else {
    nextHeaders.delete("x-router-degraded");
  }

  if (typeof metadata.confidence === "number" && Number.isFinite(metadata.confidence)) {
    nextHeaders.set("x-router-confidence", String(metadata.confidence));
  } else {
    nextHeaders.delete("x-router-confidence");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: nextHeaders
  });
}
