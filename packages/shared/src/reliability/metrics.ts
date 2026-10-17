export const METRIC_NAMES = [
  'parser_requests_total',
  'parser_latency_ms',
  'candidate_match_score',
  'stream_resolution_failures_total',
  'active_voice_sessions',
  'queue_depth',
  'track_play_seconds',
  'ffmpeg_processes',
  'interaction_errors_total',
  'provider_circuit_changes_total',
  'reconnect_attempts_total',
  'reconnect_failures_total',
  'canceled_operations_total',
  'active_background_jobs',
  'backpressure_rejections_total',
  'watchdog_cleanups_total',
  'persistence_failures_total',
] as const;
export type MetricName = (typeof METRIC_NAMES)[number];
export interface MetricValue {
  name: MetricName;
  value: number;
  count: number;
  sum: number;
  min: number;
  max: number;
  buckets: number[];
}
/** Fixed-cardinality aggregates; no samples, query strings or user labels retained. */
export class Metrics {
  private readonly values = new Map<MetricName, MetricValue>();
  private entry(name: MetricName) {
    let value = this.values.get(name);
    if (!value) {
      value = {
        name,
        value: 0,
        count: 0,
        sum: 0,
        min: 0,
        max: 0,
        buckets: [0, 0, 0, 0, 0, 0],
      };
      this.values.set(name, value);
    }
    return value;
  }
  increment(name: MetricName, amount = 1) {
    if (Number.isFinite(amount) && amount >= 0)
      this.entry(name).value += amount;
  }
  set(name: MetricName, value: number) {
    if (Number.isFinite(value)) this.entry(name).value = value;
  }
  observe(name: MetricName, sample: number) {
    if (!Number.isFinite(sample) || sample < 0) return;
    const value = this.entry(name);
    value.min = value.count ? Math.min(value.min, sample) : sample;
    value.max = Math.max(value.max, sample);
    value.count++;
    value.sum += sample;
    value.value = sample;
    [0.5, 1, 10, 100, 1000, Infinity].forEach((bound, i) => {
      if (sample <= bound) value.buckets[i]!++;
    });
  }
  snapshot(): MetricValue[] {
    return METRIC_NAMES.map((name) => structuredClone(this.entry(name)));
  }
}
