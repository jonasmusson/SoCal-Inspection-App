export class RequestTimeoutError extends Error {
  constructor(message = 'Request timed out') {
    super(message);
    this.name = 'RequestTimeoutError';
  }
}

export function withTimeout<T>(
  request: PromiseLike<T>,
  ms = 12000,
  message = 'Request timed out',
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new RequestTimeoutError(message)), ms);
  });
  return Promise.race([Promise.resolve(request), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
