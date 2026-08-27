export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { parseWebRuntimeConfig } = await import("@odovi/runtime-config");
  try {
    parseWebRuntimeConfig(process.env);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
