// 포털 로그인 허용 판정 (DB 없이 확인 가능한 순수 함수)
// 포털 세션은 6개 앱 공용이므로, 여기서 막지 않으면 어떤 Google 계정이든 모든 앱에 들어간다.

export interface SignInUserRow {
  isActive: string;
}

// "vanam.co.kr, example.com" → ["vanam.co.kr", "example.com"] (빈 값이면 빈 배열 = 도메인 제한 없음)
export function parseAllowedDomains(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

export function isSignInAllowed(
  email: string | null | undefined,
  emailVerified: unknown,
  userRow: SignInUserRow | null,
  allowedDomains: string[],
): boolean {
  if (!email || emailVerified !== true) return false;
  if (!userRow || userRow.isActive !== "Y") return false;
  if (allowedDomains.length > 0) {
    const domain = email.trim().toLowerCase().split("@").pop() ?? "";
    if (!allowedDomains.includes(domain)) return false;
  }
  return true;
}
