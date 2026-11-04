import { betterAuth } from "better-auth";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { env } from "../config/env.js";
import { prisma } from "./prisma.js";

export const auth = betterAuth({
  appName: "Developer Community website",

  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  emailAndPassword: { enabled: true },
});
