import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { prisma } from "@/lib/prisma";
import { decideSignIn, parseAllowedDomains, type SignInUserRow } from "@/lib/sign-in-policy";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    // public."user" 의 활성 사용자(is_active = 'Y')만 로그인 허용. 조회 실패 시 막는다.
    async signIn({ user, profile }) {
      const email = (profile?.email ?? user?.email)?.trim();
      const verified = profile?.email_verified;
      const allowedDomains = parseAllowedDomains(process.env.ALLOWED_EMAIL_DOMAINS);

      let rows: SignInUserRow[] = [];
      if (email && verified === true) {
        try {
          // 와일드카드(% _) 없는 정확한 비교. 이메일은 파라미터로 바인딩된다.
          rows = await prisma.$queryRaw<SignInUserRow[]>`
            SELECT is_active FROM public."user" WHERE lower(email) = lower(${email}) LIMIT 2
          `;
        } catch (e) {
          console.error("signIn user lookup error:", e);
          return false;
        }
      }

      const decision = decideSignIn(email, verified, rows, allowedDomains);
      if (decision !== "ok") {
        console.warn("signIn denied:", decision, email ?? "(no email)");
        return false;
      }
      return true;
    },
  },
});
