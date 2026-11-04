import type { 
    FastifyInstance,
    FastifyRequest,
    FastifyReply
} from "fastify";
import { fromNodeHeaders } from "better-auth/node";
import { env } from "../config/env.js";
import { auth } from "../lib/auth.js";

export async function authRoute(app: FastifyInstance) {
  const handler = async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    try {
      const url = new URL(request.url, env.BETTER_AUTH_URL);
      const headers = fromNodeHeaders(request.headers);

      const webRequest = new Request(url, {
        method: request.method,
        headers,
        ...(request.body !== undefined
          ? { body: JSON.stringify(request.body) }
          : {}),
      });

      const response = await auth.handler(webRequest);

      reply.status(response.status);

      response.headers.forEach((value, key) => {
         if(key.toLocaleLowerCase() !== "set-cookie"){   
          reply.header(key, value);
        }
      });
      
      // Preserve individual Set-Cookie headers.
      const cookies = response.headers.getSetCookie()

      if(cookies.length > 0){
          reply.header("set-cookie", cookies)
      }

      const responseBody =
        response.body !== null
          ? await response.text()
          : null
      return reply.send(responseBody);
    } catch (error) {
      request.log.error(
        { err: error },
        "Authentication request failed",
      );

      return reply.status(500).send({
        error: "Internal authentication error",
        code: "AUTH_FAILURE",
      });
    }
  };

  app.route({
    method: ["GET", "POST"],
    url: "/api/auth",
    handler,
  });

  app.route({
    method: ["GET", "POST"],
    url: "/api/auth/*",
    handler,
  });
}
