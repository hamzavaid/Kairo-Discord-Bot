import { FairLimiter, WorkScope, OperationError, Metrics } from '@kairo/shared';
import { MusicError } from '../api/errors.js';
import type { ProviderHealth } from '../api/reliability.js';
import { realSleep, type Sleep } from '../providers/musicbrainz/RequestGate.js';

interface State extends ProviderHealth {
  probe: boolean;
}
export class ProviderSupervisor {
  private readonly states = new Map<string, State>();
  private readonly jobs = new WorkScope(20_000);
  private readonly gate = new FairLimiter(8, 2, 64);
  constructor(
    private readonly options: {
      attempts?: number;
      failureThreshold?: number;
      cooldownMs?: number;
      now?: () => number;
      sleep?: Sleep;
      random?: () => number;
      metrics?: Metrics;
    } = {},
  ) {}
  private now() {
    return this.options.now?.() ?? Date.now();
  }
  register(id: string) {
    if (!this.states.has(id))
      this.states.set(id, { id, circuit: 'CLOSED', failures: 0, probe: false });
  }
  private transition(state: State, circuit: State['circuit']) {
    if (state.circuit !== circuit)
      this.options.metrics?.increment('provider_circuit_changes_total');
    state.circuit = circuit;
  }
  snapshot(): ProviderHealth[] {
    return [...this.states.values()].map(({ probe: _probe, ...state }) => {
      void _probe;
      return { ...state };
    });
  }
  async run<T>(
    id: string,
    operation: (signal: AbortSignal) => Promise<T>,
    signal?: AbortSignal,
    timeoutMs = 20_000,
  ): Promise<T> {
    this.register(id);
    const state = this.states.get(id)!;
    if ((state.retryAt ?? 0) > this.now() || state.probe)
      throw new MusicError(
        'PROVIDER_UNAVAILABLE',
        'This music provider is cooling down.',
        false,
      );
    const probe = state.circuit === 'OPEN';
    if (probe) {
      state.probe = true;
      this.transition(state, 'HALF_OPEN');
    }
    try {
      const result = await this.jobs.run(
        (active) =>
          this.gate.run(
            id,
            async () => {
              const started = this.now();
              // MusicBrainz owns its existing retry/throttle policy. Do not multiply it.
              const attempts =
                id === 'musicbrainz' ? 1 : (this.options.attempts ?? 2);
              for (let attempt = 0; ; attempt++) {
                active.throwIfAborted();
                try {
                  return await operation(active);
                } catch (error) {
                  if (
                    active.aborted ||
                    !(error instanceof MusicError) ||
                    !error.retryable ||
                    !['PROVIDER_TIMEOUT', 'PROVIDER_UNAVAILABLE'].includes(
                      error.code,
                    )
                  )
                    throw error;
                  const retryAfter = error.diagnostics?.retryAfterMs ?? 0;
                  if (retryAfter) state.retryAt = this.now() + retryAfter;
                  const wait = Math.max(
                    retryAfter,
                    250 * 2 ** attempt +
                      Math.floor(
                        (this.options.random?.() ?? Math.random()) * 100,
                      ),
                  );
                  if (
                    attempt + 1 >= attempts ||
                    this.now() - started + wait >= timeoutMs
                  )
                    throw error;
                  await (this.options.sleep ?? realSleep)(wait, active);
                }
              }
            },
            active,
          ),
        signal,
        timeoutMs,
      );
      state.failures = 0;
      delete state.retryAt;
      delete state.lastError;
      this.transition(state, 'CLOSED');
      return result;
    } catch (error) {
      if (
        signal?.aborted ||
        (error instanceof OperationError &&
          error.code === 'OPERATION_CANCELLED')
      )
        throw new MusicError(
          'PARSER_CANCELLED',
          'The music request was cancelled.',
        );
      const failure =
        error instanceof OperationError
          ? new MusicError(
              error.code === 'RESOURCE_BUSY'
                ? 'RESOURCE_BUSY'
                : 'PROVIDER_TIMEOUT',
              error.message,
              true,
            )
          : error instanceof MusicError
            ? error
            : new MusicError(
                'PROVIDER_PARSE_ERROR',
                'The music source returned invalid metadata.',
              );
      state.lastError = failure.code;
      if (
        failure.retryable &&
        ['PROVIDER_UNAVAILABLE', 'PROVIDER_TIMEOUT'].includes(failure.code)
      ) {
        state.failures++;
        if (probe || state.failures >= (this.options.failureThreshold ?? 3)) {
          this.transition(state, 'OPEN');
          state.retryAt = Math.max(
            state.retryAt ?? 0,
            this.now() + (this.options.cooldownMs ?? 30_000),
          );
        }
      } else if (probe) {
        this.transition(state, 'CLOSED');
      }
      throw failure;
    } finally {
      state.probe = false;
      if (state.circuit === 'HALF_OPEN') this.transition(state, 'OPEN');
    }
  }
  close() {
    this.jobs.close();
    this.gate.close();
  }
}
