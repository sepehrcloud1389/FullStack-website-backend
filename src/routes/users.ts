import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { fromNodeHeaders } from "better-auth/node";

import { auth } from "../lib/auth.js";
import { prisma } from "../lib/prisma.js";

const userParamsSchema = z.object({
  userId: z.string().trim().min(1).max(128),
});

const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    image: z
      .union([
        z.string().trim().max(2048).url(),
        z.null(),
      ])
      .optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one profile field must be provided",
  });

export async function usersRoutes(app: FastifyInstance) {
  // Get a public user profile
  app.get("/api/users/:userId", async (request, reply) => {
    const paramsResult = userParamsSchema.safeParse(request.params);

    if (!paramsResult.success) {
      return reply.code(400).send({
        error: "Invalid user ID",
        details: paramsResult.error.issues,
      });
    }

    const user = await prisma.user.findUnique({
      where: { id: paramsResult.data.userId },
      select: {
        id: true,
        name: true,
        image: true,
        createdAt: true,
      },
    });

    if (!user) {
      return reply.code(404).send({
        error: "User not found",
      });
    }

    return reply.code(200).send({ user });
  });

  // Update the authenticated user's own profile
  app.patch("/api/users/me", async (request, reply) => {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(request.headers),
    });

    if (!session) {
      return reply.code(401).send({
        error: "Authentication required",
      });
    }

    const bodyResult = updateProfileSchema.safeParse(request.body);

    if (!bodyResult.success) {
      return reply.code(400).send({
        error: "Invalid profile data",
        details: bodyResult.error.issues,
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: session.user.id },
      data: bodyResult.data,
      select: {
        id: true,
        name: true,
        image: true,
        updatedAt: true,
      },
    });

    return reply.code(200).send({
      message: "Profile updated successfully",
      user: updatedUser,
    });
  });
}
