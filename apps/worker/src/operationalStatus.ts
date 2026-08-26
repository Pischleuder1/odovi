/** Stable status codes are safe to persist and show; raw errors stay in logs. */
export function workerErrorCode(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("kompatibilitätsprüfung") || message.includes("compatibility")) {
    return "incompatible_schema";
  }
  if (message.includes("password authentication") || message.includes("authentication failed")) {
    return "authentication_failed";
  }
  if (message.includes("timeout") || message.includes("timed out")) return "timeout";
  if (
    message.includes("connect") ||
    message.includes("econnrefused") ||
    message.includes("enotfound")
  ) {
    return "connection_failed";
  }
  return "sync_failed";
}
