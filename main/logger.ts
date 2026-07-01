type LogLevel = "debug" | "info" | "error";

function write(level: LogLevel, scope: string, message: string, ...rest: unknown[]): void {
  const prefix = `[${new Date().toISOString()}] [${scope}]`;
  const line = `${prefix} ${message}`;

  if (level === "error") {
    console.error(line, ...rest);
    return;
  }

  if (level === "debug") {
    console.debug(line, ...rest);
    return;
  }

  console.info(line, ...rest);
}

export const logger = {
  debug: (scope: string, message: string, ...rest: unknown[]) => write("debug", scope, message, ...rest),
  info: (scope: string, message: string, ...rest: unknown[]) => write("info", scope, message, ...rest),
  error: (scope: string, message: string, ...rest: unknown[]) => write("error", scope, message, ...rest),
};
