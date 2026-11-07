import Fastify from "fastify";
import { healthRoutes } from "./routes/health.js";

//INFO: Routes
import { authRoute } from "./routes/auth.js";
import { adminRoutes } from './routes/admin.js'
export function buildApp() {
  const app = Fastify({
    logger: true,
  });

  app.register(healthRoutes);
  app.register(authRoute)
  app.register(adminRoutes)
  return app;
}
