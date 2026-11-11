import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { buildApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { env } from '../src/config/env.js'
import { UserRole } from '../src/generated/prisma/client.js'

test("admin role management", async () => {
    const app = buildApp()

    const password = "TestPassword123!"
    const testId = randomUUID()

    // Unique test accounts
    const adminEmail = `admin-${testId}@example.com`
    const memberEmail = `member-${testId}@example.com`
    const authorEmail = `author-${testId}@example.com`
    const secondAdminEmail = `second-admin-${testId}@example.com`
    
    // Helper: register an account and obtain its session cooike.
    async function createAccount(email: string, name: string){
        const signup = await app.inject({
            method: "POST",
            url: "/api/auth/sign-up/email",
            headers: {
                origin: env.BETTER_AUTH_URL
            },
            payload: {
                name, 
                email,
                password
            }
        })

        assert.equal(signup.statusCode, 200)

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
        assert.ok(rawCookie, `No session cookie returned for ${email}`)

        const cookieHeaders = Array.isArray(rawCookie)
            ? rawCookie
            : rawCookie.split(/,\s*(?=[^;,]+=)/)

        const cookie = cookieHeaders
            .map((value) => value.split(";", 1)[0])
            .join("; ")

        const user = await prisma.user.findUnique({
            where: { email },
            select: { id: true, role: true }
        })

        assert.ok(user, `Could not find the registered user ${email}`)

        return {
            id: user.id,
            cookie
        }
    }

    try {
       // 1. Create the test accounts
       const admin = await createAccount(adminEmail, "Admin Test")
       const member = await createAccount(memberEmail, "Member Test")
       const author = await createAccount(authorEmail, "Author Test")
       const secondAdmin = await createAccount(secondAdminEmail, "Second Admin Test")

       // 2. Promote  the two admin accounts directly through Prisma.
       await prisma.user.update({
           where: { id: admin.id },
           data: { role: UserRole.ADMIN }
       })

       await prisma.user.update({
           where: { id: secondAdmin.id },
           data: { role: UserRole.ADMIN }
       })

       // Promote the author test account.
       await prisma.user.update({
           where: { id: author.id },
           data: { role: UserRole.AUTHOR }
       })

       // -------------------------------------------
       // Authentication and authorization
       // -------------------------------------------

       // 3. Annonymous users cannot manage role
       const annonymousRequest = await app.inject({
           method: "PATCH",
           url: `/api/admin/users/${member.id}/role`,
           payload: { role: UserRole.AUTHOR }
       })

       assert.equal(annonymousRequest.statusCode, 401)

       // 4. MEMBER cannot manage roles.
       const memberRequest = await app.inject({
           method: "PATCH",
           url: `/api/admin/users/${member.id}/role`,
           headers: { cookie: member.cookie },
           payload: { role: UserRole.AUTHOR }
       })

       assert.equal(memberRequest.statusCode, 403)

       // 5. AUTHOR cannot manage roles.
       const authorRequest = await app.inject({
           method: "PATCH",
           url: `/api/admin/users/${member.id}/role`,
           headers: { cookie: author.cookie },
           payload: { role: UserRole.AUTHOR }
       })

       assert.equal(authorRequest.statusCode, 403)

       // --------------------------------------
       // Successful role management
       // -------------------------------------

       // 6. ADMIN can promote MEMBER to AUTHOR
       const promoteRequest = await app.inject({
           method: "PATCH",
           url: `/api/admin/users/${member.id}/role`,
           headers: { cookie: admin.cookie },
           payload: { role: UserRole.AUTHOR }
       })

       assert.equal(promoteRequest.statusCode, 200)

       assert.equal(promoteRequest.json().user.role, UserRole.AUTHOR)

       const promotedUser = await prisma.user.findUnique({
           where: { id: member.id },
           select: { role: true }
       })

       assert.equal(promotedUser?.role, UserRole.AUTHOR)

       // 7. ADMIN can change AUTHOR back to MEMBER
       const demotedRequest = await app.inject({
           method: "PATCH",
           url: `/api/admin/users/${member.id}/role`,
           headers: { cookie: admin.cookie },
           payload: { role: UserRole.MEMBER }
       })

       assert.equal(demotedRequest.statusCode, 200)

       const demotedUser = await prisma.user.findUnique({
           where: { id: member.id },
           select: { role: true }
       })

       assert.equal(demotedUser?.role, UserRole.MEMBER)


       // ------------------------------------
       // Validation and error handling
       // -----------------------------------

       // 8. Invalid role should return 400
       const invalidRoleRequest = await app.inject({
           method: "PATCH",
           url: `/api/admin/users/${member.id}/role`,
           headers: { cookie: admin.cookie },
           payload: { role: "INVALID_ROLE" }
       })

       assert.equal(invalidRoleRequest.statusCode, 400)

       // 9. ADMIN cannot assign through this endpoint
       const adminAssignmentRequest = await app.inject({
           method: "PATCH",
           url: `/api/admin/users/${member.id}/role`,
           headers: { cookie: admin.cookie },
           payload: { role: UserRole.ADMIN }
       })

       assert.equal(adminAssignmentRequest.statusCode, 400)

       // 10. Nonexistent users should return 404
       const missingUserRequest = await app.inject({
           method: "PATCH",
           url: `/api/admin/users/nonexistent-${testId}/role`,
           headers: { cookie: admin.cookie },
           payload: { role: UserRole.AUTHOR }
       })

       assert.equal(missingUserRequest.statusCode, 404)

       // 11. Existing ADMIN accounts cannot be modified.
       const existingAdminRequest = await app.inject({
           method: "PATCH",
           url: `/api/admin/users/${secondAdmin.id}/role`,
           headers: { cookie: admin.cookie },
           payload: { role: UserRole.MEMBER }
       })

       assert.equal(existingAdminRequest.statusCode, 409)

       // Verify the second admin is still an ADMIN
       const unchangedAdmin = await prisma.user.findUnique({
           where: { id: secondAdmin.id },
           select: { role: true }
       })

       assert.equal(unchangedAdmin?.role, UserRole.ADMIN)
    } finally {
        // Remove all test users and their sessions/accounts
        await prisma.user.deleteMany({
            where: {
                email: {
                    in: [ adminEmail, memberEmail, authorEmail, secondAdminEmail ]
                }
            }
        })
       await app.close()
    }
})
