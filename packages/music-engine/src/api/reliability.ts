import type { MetricValue } from '@kairo/shared';
export interface ReliabilityOptions {
  providerAttempts?: number;
  circuitFailures?: number;
  circuitCooldownMs?: number;
  providerConcurrency?: number;
  providerPerGuild?: number;
  streamConcurrency?: number;
  collectionConcurrency?: number;
  ffmpegProcesses?: number;
  maxSessions?: number;
  maxWaiting?: number;
  watchdogIntervalMs?: number;
  stuckSessionMs?: number;
}
export interface ProviderHealth {
  id: string;
  circuit: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  retryAt?: number;
  lastError?: string;
}
export interface EngineHealth {
  status: 'healthy' | 'degraded' | 'closed';
  providers: ProviderHealth[];
  resources: Record<string, number>;
  metrics: MetricValue[];
}
