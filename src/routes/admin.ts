import type { FastifyInstance } from "fastify";

import { requireRole } from '../lib/authorization.js'
import { UserRole } from '../generated/prisma/client.js'

export async function adminRoutes(app: FastifyInstance){
    app.get("/api/admin/dashboard", { preHandler: requireRole(UserRole.ADMIN) }, async () => {
        return {
            message: "Welcome to the admin dashboard"
        }
    })
}
