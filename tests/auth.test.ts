import { test } from 'node:test'
import assert from 'node:assert'
import { randomUUID } from 'node:crypto'

import { buildApp } from '../src/app.js'
import { prisma } from '../src/lib/prisma.js'
import { env } from '../src/config/env.js'

test("authentication lifecycle", async () => {
    const app = buildApp()

    // A unique email prevents conflicts between test runs.
    const email = `auth-test-${randomUUID()}@example.com`
    const password = "TestPassword123!"

    try{
        // 1. Register a new user
        const signup = await app.inject({
            method: "POST",
            url: "/api/auth/sign-up/email",
            headers: {
                origin: env.BETTER_AUTH_URL
            },
            payload: {
                name: "Authentication Test",
                email,
                password
            }
        })

        assert.equal(signup.statusCode, 200)

        // 2. Verify duplicate registration is rejected
        const duplicateSignup = await app.inject({
            method: "POST",
            url: "/api/auth/sign-up/email",
            headers: {
                origin: env.BETTER_AUTH_URL
            },
            payload: {
                name: "Authentication Test",
                email,
                password
            }
        })

        assert.ok(duplicateSignup.statusCode >= 400)

        // 3. Verify an incorrect password is rejected
        const invalidLogin = await app.inject({
            method: "POST",
            url: "/api/auth/sign-in/email",
            headers: {
                origin: env.BETTER_AUTH_URL
            },
            payload: {
                email,
                password: "WrongPassword123!"
            }
        })

        assert.ok(invalidLogin.statusCode >= 400)

        // 4. Sign in with the correct credentials.
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

       // Extract coockies without printing or exposing their values
       const rawCookie = login.headers["set-cookie"]
       assert.ok(rawCookie, "login should return session cookie")

       const cookieHeaders = Array.isArray(rawCookie)
         ? rawCookie
         : rawCookie.split(/,\s*(?=[^;,]+=)/)

       const cookie = cookieHeaders
         .map((value) => value.split(";", 1)[0])
         .join(";")

       // 5. Retrive the authenticated session
       const session = await app.inject({
           method: "GET",
           url: "/api/auth/get-session",
           headers: {
               cookie
           }
       })

       assert.equal(session.statusCode, 200)

       const sessionBody = session.json<{
           user: { email: string },
           session: { id: string }
       }>()

       assert.equal(sessionBody.user.email, email)
       assert.ok(sessionBody.session.id)

       // 6. Sign out
       const logout = await app.inject({
           method: "POST",
           url: "/api/auth/sign-out",
           headers: {
               origin: env.BETTER_AUTH_URL,
               cookie
           }
       })

       assert.equal(logout.statusCode, 200)
       assert.equal(logout.json().success, true)
       
       const logoutCookies = logout.headers["set-cookie"]

       assert.ok(logoutCookies, "Logout should clear session cookies")

       const logoutCookiesArray = Array.isArray(logoutCookies)
          ? logoutCookies
          : [logoutCookies]

       assert.ok(
           logoutCookiesArray.some((cookie) => 
                cookie.startsWith("better-auth.session_token="),
            ),
            "logout should clear the session token cookie"
       )
       // 7. Verify the session is no longer available
       const sessionAfterLogout = await app.inject({
           method: "GET",
           url: "/api/auth/get-session",
           headers: {
               cookie
           }
       })

       assert.equal(sessionAfterLogout.statusCode, 200)
       assert.equal(sessionAfterLogout.body, "null")
    } finally {
        // Remove th test user and related record
        // Database cascade rules removes its session and accounts.
        await prisma.user.deleteMany({
            where: { email }
        })

        await app.close()
    }
})
