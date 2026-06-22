import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Edge Runtime용 — Prisma 없는 authConfig만 사용
const { auth } = NextAuth(authConfig);

export default auth((req: NextRequest & { auth: any }) => {
  const { pathname } = req.nextUrl;

  // /api/auth/* 는 next-auth 내부 경로 — 항상 허용
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // /api/nas-status 는 내부 시스템 API — 인증 없이 허용
  if (pathname.startsWith("/api/nas-status")) {
    return NextResponse.next();
  }

  // /login 은 항상 허용 (포털 자체 로그인 페이지)
  if (pathname.startsWith("/login")) {
    return NextResponse.next();
  }

  // /api/internal/* 는 머신 토큰으로 자체 인증 — 세션 불필요
  if (pathname.startsWith("/api/internal")) {
    return NextResponse.next();
  }

  // PWA 정적 자산(manifest.json, sw.js, 아이콘)은 인증 없이 통과
  // (브라우저가 자격증명 없이 요청하므로 인증 redirect가 끼면 PWA가 깨짐)
  if (/\.(?:json|js|png|jpg|jpeg|gif|svg|ico|webmanifest)$/.test(pathname)) {
    return NextResponse.next();
  }

  // 미인증 시 포털 로그인으로 리다이렉트
  if (!req.auth?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
