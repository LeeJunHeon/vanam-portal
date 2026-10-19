import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";
import { isSignInAllowed, parseAllowedDomains } from "@/lib/sign-in-policy";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // public."user" 의 활성 사용자(is_active = 'Y')만 로그인 허용. 조회 실패 시 막는다.
    async signIn({ user, profile }) {
      const email = (profile?.email ?? user?.email)?.trim();
      if (!email || profile?.email_verified !== true) return false;
      try {
        const row = await prisma.appUser.findFirst({
          where: { email: { equals: email, mode: "insensitive" } },
          select: { isActive: true },
        });
        return isSignInAllowed(
          email,
          profile.email_verified,
          row,
          parseAllowedDomains(process.env.ALLOWED_EMAIL_DOMAINS),
        );
      } catch (e) {
        console.error("signIn user lookup error:", e);
        return false;
      }
    },
  },
});
