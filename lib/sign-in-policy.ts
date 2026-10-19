// 포털 로그인 허용 판정 (DB 없이 확인 가능한 순수 함수)
// 포털 세션은 6개 앱 공용이므로, 여기서 막지 않으면 어떤 Google 계정이든 모든 앱에 들어간다.

// public."user" 조회 결과 행 (lower(email) 정확 비교, LIMIT 2)
export interface SignInUserRow {
  is_active: string | null;
}

export type SignInDecision =
  | "ok"
  | "no_email"
  | "unverified"
  | "not_registered" // 0행
  | "duplicate" // 2행 이상 (대소문자만 다른 중복 등록)
  | "inactive" // is_active 가 'Y' 아님
  | "domain"; // ALLOWED_EMAIL_DOMAINS 설정 시 도메인 불일치

// "vanam.co.kr, example.com" → ["vanam.co.kr", "example.com"] (빈 값이면 빈 배열 = 도메인 제한 없음)
export function parseAllowedDomains(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase().replace(/^@/, ""))
    .filter(Boolean);
}

// 로그인은 "ok" 일 때만 허용한다
export function decideSignIn(
  email: string | null | undefined,
  emailVerified: unknown,
  rows: SignInUserRow[],
  allowedDomains: string[],
): SignInDecision {
  if (!email) return "no_email";
  if (emailVerified !== true) return "unverified";
  if (rows.length === 0) return "not_registered";
  if (rows.length > 1) return "duplicate";
  if (rows[0].is_active !== "Y") return "inactive";
  if (allowedDomains.length > 0) {
    const domain = email.trim().toLowerCase().split("@").pop() ?? "";
    if (!allowedDomains.includes(domain)) return "domain";
  }
  return "ok";
}
