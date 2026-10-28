import { buildApp } from "./app.js";
import { env } from "./config/env.js";

const app = buildApp();

async function start(): Promise<void> {
  try {
    await app.listen({
      host: env.HOST,
      port: env.PORT,
    });
  } catch (error) {
    app.log.error(error, "Failed to start server");
    process.exitCode = 1;
  }
}

async function shutdown(signal: string) {
  app.log.info({ signal }, "Shutting down server");

  try {
    await app.close();
  } catch (error) {
    app.log.error(error, "Error during shutdown");
    process.exitCode = 1;
  }
}

process.once("SIGINT", () => {
  void shutdown("SIGINT");
});

process.once("SIGTERM", () => {
  void shutdown("SIGTERM");
});

void start();
