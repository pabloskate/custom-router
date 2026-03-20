export interface RoutedResponseMetadata {
  routedModel?: string;
  classificationConfidence?: number;
}

export function parseRoutingConfidence(rawValue: string | null): number | undefined {
  if (!rawValue) {
    return undefined;
  }

  const confidence = Number(rawValue);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return undefined;
  }

  return confidence;
}

export function readRoutedResponseMetadata(headers: Headers): RoutedResponseMetadata {
  const routedModel = headers.get("x-router-model-selected") ?? undefined;

  return {
    routedModel: routedModel || undefined,
    classificationConfidence: parseRoutingConfidence(headers.get("x-router-confidence")),
  };
}

export function formatRoutingConfidence(confidence?: number): string | null {
  if (typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return null;
  }

  return confidence.toFixed(2);
}
