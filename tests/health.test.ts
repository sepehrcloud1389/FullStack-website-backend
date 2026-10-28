import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";

test("GET /health returns the expected response", async () => {
  const app = buildApp();

  try {
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    assert.equal(response.statusCode, 200);

    assert.deepEqual(response.json(), {
      status: "ok",
      service: "tech-platform-api",
    });
  } finally {
    await app.close();
  }
});
