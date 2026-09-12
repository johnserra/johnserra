export class ChatDeadlineError extends Error {
  override name = "ChatDeadlineError";
  readonly code = "TIMEOUT" as const;

  constructor(readonly stage: "preparation" | "model") {
    super(`${stage} deadline exceeded`);
  }
}

export interface LinkedAbortController {
  signal: AbortSignal;
  abort(reason?: unknown): void;
  dispose(): void;
}

/** Link a request signal to work owned by a cancellable response stream. */
export function createLinkedAbortController(parent?: AbortSignal): LinkedAbortController {
  const controller = new AbortController();
  let disposed = false;
  const onAbort = () => controller.abort(parent?.reason);

  if (parent?.aborted) {
    onAbort();
  } else {
    parent?.addEventListener("abort", onAbort, { once: true });
  }

  return {
    signal: controller.signal,
    abort(reason?: unknown) {
      controller.abort(reason);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      parent?.removeEventListener("abort", onAbort);
    },
  };
}

function abortError(signal: AbortSignal): DOMException {
  return signal.reason instanceof DOMException
    ? signal.reason
    : new DOMException("The operation was aborted.", "AbortError");
}

export async function withChatDeadline<T>(
  work: (signal: AbortSignal) => Promise<T>,
  options: { stage: "preparation" | "model"; deadlineMs: number; signal?: AbortSignal },
): Promise<T> {
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbort: (() => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      const error = new ChatDeadlineError(options.stage);
      controller.abort(error);
      reject(error);
    }, Math.max(1, options.deadlineMs));
  });
  const cancellation = options.signal
    ? new Promise<never>((_, reject) => {
        const onAbort = () => {
          const error = abortError(options.signal!);
          controller.abort(error);
          reject(error);
        };
        options.signal!.addEventListener("abort", onAbort, { once: true });
        removeAbort = () => options.signal!.removeEventListener("abort", onAbort);
      })
    : undefined;
  try {
    const pending = work(controller.signal);
    return await Promise.race(cancellation ? [pending, timeout, cancellation] : [pending, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
    removeAbort?.();
  }
}

/** Iterate a provider stream with a real deadline, including providers that ignore abort. */
export async function* streamWithChatDeadline<T>(
  getStream: (signal: AbortSignal) => Promise<AsyncIterable<T>>,
  options: { stage: "model"; deadlineMs: number; signal?: AbortSignal },
): AsyncGenerator<T> {
  options.signal?.throwIfAborted();
  const controller = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let removeAbort: (() => void) | undefined;
  let rejectTimeout: ((error: ChatDeadlineError) => void) | undefined;
  const timeout = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
    timer = setTimeout(() => {
      timedOut = true;
      const error = new ChatDeadlineError(options.stage);
      controller.abort(error);
      reject(error);
    }, Math.max(1, options.deadlineMs));
  });
  const cancellation = options.signal
    ? new Promise<never>((_, reject) => {
        const onAbort = () => {
          const reason = abortError(options.signal!);
          controller.abort(reason);
          reject(reason);
        };
        options.signal!.addEventListener("abort", onAbort, { once: true });
        removeAbort = () => options.signal!.removeEventListener("abort", onAbort);
      })
    : undefined;

  try {
    const stream = await Promise.race(cancellation ? [getStream(controller.signal), timeout, cancellation] : [getStream(controller.signal), timeout]);
    const iterator = stream[Symbol.asyncIterator]();
    while (true) {
      const next = await Promise.race(cancellation ? [iterator.next(), timeout, cancellation] : [iterator.next(), timeout]);
      if (next.done) break;
      yield next.value;
    }
  } catch (error) {
    if (timedOut) {
      rejectTimeout?.(new ChatDeadlineError(options.stage));
    }
    throw error;
  } finally {
    if (timer) clearTimeout(timer);
    removeAbort?.();
  }
}
