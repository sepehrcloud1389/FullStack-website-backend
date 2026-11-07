import type { preHandlerHookHandler } from "fastify";
import { fromNodeHeaders } from "better-auth/node";

import { auth } from './auth.js'
import { prisma } from "./prisma.js";
import { UserRole } from '../generated/prisma/client.js'

export function requireRole(
    ...allowedRoles: UserRole[]
): preHandlerHookHandler {
    return async (request, reply) => {
        // 1. Retrieve the current authenticated session
        const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers)})

        // 2. Reject unauthenticated request
        if (!session) {
            return reply.code(401).send({ error: "Authentication required" })
        }

        // 3. Retrieve the user's current role from PostgreSQL
        const user = await prisma.user.findUnique({
            where: { id: session.user.id },
            select: { role: true }
        })

        // 4. Reject requests from users no longer in the database
        if(!user){
            return reply.code(401).send({
                error: "User not found"
            })
        }

        // 5. Verify the user's role
        if(!allowedRoles.includes(user.role)){
            return reply.code(403).send({ error: "Insufficient permission" })
        }

        // 6. Continue to the route handler.
    }
}
