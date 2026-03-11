function mergeHeaders(headers?: HeadersInit): Headers {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "application/json");
  }
  return responseHeaders;
}

export function json(data: unknown, status = 200, headers?: HeadersInit): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: mergeHeaders(headers),
  });
}

export function jsonNoStore(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = mergeHeaders(headers);
  responseHeaders.set("cache-control", "no-store");
  return json(data, status, responseHeaders);
}

export function attachRouterHeaders(
  response: Response,
  metadata: {
    model: string;
    catalogVersion: string;
    requestId: string;
    degraded: boolean;
  }
): Response {
  const nextHeaders = new Headers(response.headers);
  nextHeaders.set("x-router-model-selected", metadata.model);
  nextHeaders.set("x-router-score-version", metadata.catalogVersion);
  nextHeaders.set("x-router-request-id", metadata.requestId);

  if (metadata.degraded) {
    nextHeaders.set("x-router-degraded", "true");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: nextHeaders
  });
}
