export function after(delay: number, signal: AbortSignal, run: () => void): void {
  if (signal.aborted) return;
  const timer = window.setTimeout(() => {
    signal.removeEventListener("abort", cancel);
    run();
  }, delay);
  const cancel = (): void => window.clearTimeout(timer);
  signal.addEventListener("abort", cancel, { once: true });
}
