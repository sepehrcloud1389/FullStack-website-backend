import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { env } from "../src/config/env.js";

test("user profile endpoints", async () => {
  const app = buildApp();

  const password = "TestPassword123!";
  const testId = randomUUID();

  const userEmail = `profile-${testId}@example.com`;
  const otherUserEmail = `other-profile-${testId}@example.com`;

  // Register an account and obtain its session cookie.
  async function createAccount(email: string, name: string) {
    const signup = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: {
        origin: env.BETTER_AUTH_URL,
      },
      payload: {
        name,
        email,
        password,
      },
    });

    assert.equal(signup.statusCode, 200);

    const login = await app.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: {
        origin: env.BETTER_AUTH_URL,
      },
      payload: {
        email,
        password,
      },
    });

    assert.equal(login.statusCode, 200);

    const rawCookie = login.headers["set-cookie"];
    assert.ok(rawCookie, `No session cookie returned for ${email}`);

    const cookieHeaders = Array.isArray(rawCookie)
      ? rawCookie
      : rawCookie.split(/,\s*(?=[^;,]+=)/);

    const cookie = cookieHeaders
      .map((value) => value.split(";", 1)[0])
      .join("; ");

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });

    assert.ok(user, `Could not find registered user ${email}`);

    return {
      id: user.id,
      cookie,
    };
  }

  try {
    // Create two separate users.
    const user = await createAccount(userEmail, "Profile Test User");
    const otherUser = await createAccount(
      otherUserEmail,
      "Other Profile User",
    );

    // -------------------------------------------
    // Public profile retrieval
    // -------------------------------------------

    // 1. An existing user's public profile is available.
    const publicProfile = await app.inject({
      method: "GET",
      url: `/api/users/${user.id}`,
    });

    assert.equal(publicProfile.statusCode, 200);

    const profileBody = publicProfile.json();

    assert.deepEqual(
      Object.keys(profileBody.user).sort(),
      ["createdAt", "id", "image", "name"].sort(),
    );

    assert.equal(profileBody.user.id, user.id);
    assert.equal(profileBody.user.name, "Profile Test User");

    // 2. A nonexistent user returns 404.
    const missingProfile = await app.inject({
      method: "GET",
      url: `/api/users/nonexistent-${testId}`,
    });

    assert.equal(missingProfile.statusCode, 404);

    // -------------------------------------------
    // Authentication and authorization
    // -------------------------------------------

    // 3. Anonymous users cannot update profiles.
    const anonymousUpdate = await app.inject({
      method: "PATCH",
      url: "/api/users/me",
      payload: {
        name: "Unauthorized Update",
      },
    });

    assert.equal(anonymousUpdate.statusCode, 401);

    // -------------------------------------------
    // Successful profile updates
    // -------------------------------------------

    // 4. An authenticated user can update their own name.
    const updateName = await app.inject({
      method: "PATCH",
      url: "/api/users/me",
      headers: {
        cookie: user.cookie,
      },
      payload: {
        name: "Updated Profile User",
      },
    });

    assert.equal(updateName.statusCode, 200);
    assert.equal(
      updateName.json().user.name,
      "Updated Profile User",
    );

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true },
    });

    assert.equal(updatedUser?.name, "Updated Profile User");

    // 5. An authenticated user can set a profile image.
    const updateImage = await app.inject({
      method: "PATCH",
      url: "/api/users/me",
      headers: {
        cookie: user.cookie,
      },
      payload: {
        image: "https://example.com/profile.png",
      },
    });

    assert.equal(updateImage.statusCode, 200);
    assert.equal(
      updateImage.json().user.image,
      "https://example.com/profile.png",
    );

    // 6. An authenticated user can clear their profile image.
    const clearImage = await app.inject({
      method: "PATCH",
      url: "/api/users/me",
      headers: {
        cookie: user.cookie,
      },
      payload: {
        image: null,
      },
    });

    assert.equal(clearImage.statusCode, 200);
    assert.equal(clearImage.json().user.image, null);

    const clearedUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { image: true },
    });

    assert.equal(clearedUser?.image, null);

    // -------------------------------------------
    // Validation and security
    // -------------------------------------------

    // 7. An empty update body is rejected.
    const emptyUpdate = await app.inject({
      method: "PATCH",
      url: "/api/users/me",
      headers: {
        cookie: user.cookie,
      },
      payload: {},
    });

    assert.equal(emptyUpdate.statusCode, 400);

    // 8. An invalid image URL is rejected.
    const invalidImage = await app.inject({
      method: "PATCH",
      url: "/api/users/me",
      headers: {
        cookie: user.cookie,
      },
      payload: {
        image: "not-a-valid-url",
      },
    });

    assert.equal(invalidImage.statusCode, 400);

    // 9. Users cannot assign themselves privileged roles.
    const roleUpdate = await app.inject({
      method: "PATCH",
      url: "/api/users/me",
      headers: {
        cookie: user.cookie,
      },
      payload: {
        role: "ADMIN",
      },
    });

    assert.equal(roleUpdate.statusCode, 400);

    const unchangedRole = await prisma.user.findUnique({
      where: { id: user.id },
      select: { role: true },
    });

    assert.equal(unchangedRole?.role, "MEMBER");

    // 10. Users cannot supply another user's ID to update their profile.
    const otherUserUpdate = await app.inject({
      method: "PATCH",
      url: "/api/users/me",
      headers: {
        cookie: user.cookie,
      },
      payload: {
        userId: otherUser.id,
        name: "Attempted Other User Update",
      },
    });

    assert.equal(otherUserUpdate.statusCode, 400);

    const unchangedOtherUser = await prisma.user.findUnique({
      where: { id: otherUser.id },
      select: { name: true },
    });

    assert.equal(unchangedOtherUser?.name, "Other Profile User");
  } finally {
    // Remove test users and their related records.
    await prisma.user.deleteMany({
      where: {
        email: {
          in: [userEmail, otherUserEmail],
        },
      },
    });

    await app.close();
  }
});
