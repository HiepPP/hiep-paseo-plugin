declare const document:
  | {
      addEventListener(type: string, listener: () => void): void;
      removeEventListener(type: string, listener: () => void): void;
    }
  | undefined;

const subscribers = new Set<(sent: boolean) => void>();
let missedFailureAt = 0;
const MISSED_FAILURE_MS = 5_000;

// Other plugins cannot open this plugin's surface. next-prompt-actions opens the Board before
// its send is acknowledged, then reports the outcome so the Board can refresh or warn.
export function installBoardEvents(open: () => void) {
  if (typeof document === "undefined") return () => {};
  const target = document;
  const report = (sent: boolean) => {
    // A fast failure can land before the Board mounts; keep it briefly for the next mount.
    if (!subscribers.size && !sent) missedFailureAt = Date.now();
    for (const subscriber of subscribers) subscriber(sent);
  };
  const listeners: [string, () => void][] = [
    ["paseo-board:open", open],
    ["paseo-board:sent", () => report(true)],
    ["paseo-board:send-failed", () => report(false)],
  ];
  for (const [type, listener] of listeners) target.addEventListener(type, listener);
  return () => {
    for (const [type, listener] of listeners) target.removeEventListener(type, listener);
  };
}

export function subscribeSendResult(subscriber: (sent: boolean) => void, now = Date.now()) {
  if (now - missedFailureAt < MISSED_FAILURE_MS) subscriber(false);
  missedFailureAt = 0;
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
}
