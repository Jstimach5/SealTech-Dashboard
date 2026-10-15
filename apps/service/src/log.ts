/** One-line logger. Secret values never reach it: callers log key names, never contents. */
export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

function stamp(): string {
  return new Date().toISOString();
}

export const consoleLogger: Logger = {
  info: (m) => console.log(`${stamp()} ${m}`),
  warn: (m) => console.warn(`${stamp()} WARN ${m}`),
  error: (m) => console.error(`${stamp()} ERROR ${m}`),
};

/** For tests. */
export const silentLogger: Logger = { info: () => {}, warn: () => {}, error: () => {} };

/** Collects lines so a test can assert on what was logged. */
export function memoryLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  return {
    lines,
    info: (m) => void lines.push(`info ${m}`),
    warn: (m) => void lines.push(`warn ${m}`),
    error: (m) => void lines.push(`error ${m}`),
  };
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
