import type { FastifyInstance } from "fastify";
import { z } from 'zod'

import { requireRole } from '../lib/authorization.js'
import { prisma } from '../lib/prisma.js'
import { UserRole } from '../generated/prisma/client.js'

// Only MEMBER and AUTHORS cab be assign through this endpoint
const assignableRole = [UserRole.MEMBER, UserRole.AUTHOR] as const

// vailidate the URL parameter
const userParameterSchema = z.object({ userId: z.string().trim().min(1).max(128) })

// validate the request body
const updateRoleSchema = z.object({ role: z.enum(assignableRole) })

export async function adminRoutes(app: FastifyInstance){
    // Admin dashboard
    app.get("/api/admin/dashboard", { preHandler: requireRole(UserRole.ADMIN) }, async () => {
        return {
            message: "Welcome to the admin dashboard"
        }
    })

    // Admin-controlled user role management
    app.patch("/api/admin/users/:userId/role", { preHandler: requireRole(UserRole.ADMIN) }, async (request, reply) => {
        // 1.
        const paramResult = userParameterSchema.safeParse(request.params)

        if(!paramResult.success) {
            return reply.code(400).send({
                error: "Invalid user ID",
                details: paramResult.error.issues
            })
        }

        // 2. validate the request body
        const bodyResult = updateRoleSchema.safeParse(request.body)

        if(!bodyResult.success){
            return reply.code(400).send({
                error: "Invalid role",
                details: bodyResult.error.issues
            })
        }

        const { userId } = paramResult.data
        const { role } = bodyResult.data

        // 3. Find the target user
        const existingUser = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                role: true
            }
        })
        
        if (!existingUser){
            return reply.code(404).send({ error: "User not found" })
        }

        // 4. Prevent changes to existing ADMIN accounts
        if (existingUser.role === UserRole.ADMIN){
            return reply.code(409).send({ error: "Admin roles cannot be changed through this endpoint" })
        }

        // 5. Update the user's role
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { role },
            select: {
                id: true,
                role: true,
                updatedAt: true
            }
        })

        // 6. Return the updated user
        return reply.code(200).send({
            message: "User role updated successfully",
            user: updatedUser
        })
    })
}
