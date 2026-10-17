import { abortable, OperationError } from './work.js';

/** Optional ordered writes fail closed while a timed-out physical write is unresolved. */
export class WriteQueue {
  private tail = Promise.resolve();
  private size = 0;
  private blocked = false;
  private closed = false;
  constructor(
    private readonly capacity = 512,
    private readonly timeoutMs = 2000,
    private readonly report: (error: unknown) => void = () => {},
  ) {}
  private failure(code: 'RESOURCE_BUSY' | 'OPERATION_TIMEOUT') {
    try {
      this.report(new OperationError(code));
    } catch {
      /* Optional diagnostics cannot poison writes. */
    }
  }
  add(write: () => Promise<unknown>): boolean {
    if (this.closed || this.blocked || this.size >= this.capacity) {
      this.failure('RESOURCE_BUSY');
      return false;
    }
    this.size++;
    this.tail = this.tail
      .then(async () => {
        if (this.blocked) {
          this.failure('RESOURCE_BUSY');
          return;
        }
        const controller = new AbortController();
        const timer = setTimeout(() => {
          this.blocked = true;
          controller.abort(new OperationError('OPERATION_TIMEOUT'));
        }, this.timeoutMs);
        const physical = Promise.resolve().then(write);
        void physical
          .finally(() => {
            this.blocked = false;
          })
          .catch(() => {});
        try {
          await abortable(physical, controller.signal);
        } catch {
          this.failure('OPERATION_TIMEOUT');
        } finally {
          clearTimeout(timer);
        }
      })
      .catch(() => {
        this.failure('OPERATION_TIMEOUT');
      })
      .finally(() => {
        this.size--;
      });
    return true;
  }
  drain(): Promise<void> {
    return this.tail;
  }
  close(): Promise<void> {
    this.closed = true;
    return this.drain();
  }
}
