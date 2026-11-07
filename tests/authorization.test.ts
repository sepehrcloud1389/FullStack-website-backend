import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { buildApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { env } from '../src/config/env.js'
import { UserRole } from '../src/generated/prisma/client.js'

test('admin authorizaion', async () => {
    const app = buildApp()

    const email = `rbac-test-${randomUUID()}@example.com`
    const password = "TestPassword123!"

    try{
        // 1. Unauthenticated visitor should receive 401
        const anonymousRequest = await app.inject({
            method: "GET",
            url: "/api/admin/dashboard"
        })

        assert.equal(anonymousRequest.statusCode, 401)

        // 2. Register a MEMBER account.
        const signup = await app.inject({
            method: "POST",
            url: "/api/auth/sign-up/email",
            headers: { origin: env.BETTER_AUTH_URL },
            payload: { name: "RBAC test", email, password }
        })

        assert.equal(signup.statusCode, 200)

        // 3. Sign in
        const login = await app.inject({
            method: "POST",
            url: "/api/auth/sign-in/email",
            headers: {
                origin: env.BETTER_AUTH_URL
            },
            payload: {
                email,
                password
            }
        })

        assert.equal(login.statusCode, 200)

        const rawCookie = login.headers["set-cookie"]
        assert.ok(rawCookie)

        const cookieHeaders = Array.isArray(rawCookie)
           ? rawCookie
           : rawCookie.split(/,\s*(?=[^;,]+=)/)

        const cookie = cookieHeaders
          .map((value) => value.split(";", 1)[0])
          .join("; ")

        // 4. MEMBER should recieve 403
        const memberRequest = await app.inject({
            method: "GET",
            url: "/api/admin/dashboard",
            headers: { cookie }
        })

        assert.equal(memberRequest.statusCode, 403)

        // 5. Promte the test user direcly in the database
        await prisma.user.update({
            where: { email },
            data: { role: UserRole.ADMIN }
        })

        // 6. The same session should now have the ADMIN access
        const adminRequest = await app.inject({
            method: "GET",
            url: "/api/admin/dashboard",
            headers: { cookie }
        })

        assert.equal(adminRequest.statusCode, 200)

        assert.deepEqual(adminRequest.json(), { message: "Welcome to the admin dashboard" })
    }finally{
        await prisma.user.deleteMany({
            where: { email }
        })

        await app.close()
    }
})
