export interface RecentModelUsageEntry {
  requestId: string;
  createdAt: string;
  requestedModel: string;
  selectedModel: string;
  decisionReason: string;
}
