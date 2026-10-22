// HTTPS 인증서 상태 확인 (서버 전용).
// 사용자에게 실제로 나가는 인증서를 TLS 핸드셰이크로 직접 읽어 만료·검증 상태를 판정한다.
// - node:tls 의 tls.connect 만 사용하고 소켓에는 아무것도 쓰지 않는다 (HTTP 요청 없음).
// - rejectUnauthorized: false 는 이 접속 옵션에만 쓴다. 전역 TLS 설정은 절대 건드리지 않는다.
import tls from "node:tls";

const DAY_MS = 86_400_000;
const CONNECT_TIMEOUT_MS = 5_000;
const SUCCESS_TTL_MS = 6 * 60 * 60 * 1000;   // 성공 결과 재사용 6시간
const RETRY_AFTER_FAIL_MS = 10 * 60 * 1000;  // 실패 후 재시도 10분
const STALE_LIMIT_MS = 24 * 60 * 60 * 1000;  // 마지막 성공 결과 유지 24시간

export type CertStatus = "ok" | "warn" | "error" | "unknown";

export interface CertJudgement {
  status: Exclude<CertStatus, "unknown">;
  daysLeft: number;
  lifetimeDays: number;
  title: string;
  detail: string;
}

export interface CertInfo {
  notBefore: Date;
  notAfter: Date;
  issuerO: string;
  issuerCN: string;
  subjectAltName: string;
  authorized: boolean;
  authorizationError: string | null;
}

export interface CertStatusResult {
  status: CertStatus;
  title: string;
  detail: string;
  expiresAt: string | null;
  expiresAtKst: string | null;
  daysLeft: number | null;
  lifetimeDays: number | null;
  issuer: string | null;
  checkedAt: string | null;
  via: "primary" | "fallback" | null;
}

// ─────────────────────────────────────────────
// 날짜 표시: "YYYY-MM-DD HH:mm" (KST)
// 컨테이너 TZ 가 UTC 라 로컬 getter 대신 Intl 에 Asia/Seoul 을 지정한다.
// ─────────────────────────────────────────────
const KST_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export function formatKst(date: Date): string {
  const p: Record<string, string> = {};
  for (const part of KST_FORMAT.formatToParts(date)) p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// ─────────────────────────────────────────────
// 판정 (I/O 없는 순수 함수)
// 우선순위: 만료·이름 불일치 > 7일 이하 > 체인 경고 > 수명 1/4 이하 > ok
// ─────────────────────────────────────────────
const HOSTNAME_ERRORS = new Set([
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_TLS_CERT_ALTNAME_FORMAT",
  "HOSTNAME_MISMATCH",
]);

export function judgeCert(input: {
  notBefore: Date;
  notAfter: Date;
  authorizationError: string | null;
  now: Date;
}): CertJudgement {
  const { notBefore, notAfter, authorizationError, now } = input;
  const lifetime = notAfter.getTime() - notBefore.getTime();
  const remaining = notAfter.getTime() - now.getTime();
  const daysLeft = Math.floor(remaining / DAY_MS);
  const lifetimeDays = Math.round(lifetime / DAY_MS);
  const detail = `인프라 · 자동 갱신 확인 필요 · 만료 ${formatKst(notAfter)}`;
  const base = { daysLeft, lifetimeDays, detail };
  // 1일 미만 남으면 "만료 0일 전" 대신 "오늘 만료"
  const leftTitle = remaining < DAY_MS ? "HTTPS 인증서 오늘 만료" : `HTTPS 인증서 만료 ${daysLeft}일 전`;

  if (remaining <= 0 || authorizationError === "CERT_HAS_EXPIRED") {
    return { ...base, status: "error", title: "HTTPS 인증서 만료됨" };
  }
  if (authorizationError && HOSTNAME_ERRORS.has(authorizationError)) {
    return { ...base, status: "error", title: "HTTPS 인증서 이름 불일치" };
  }
  if (remaining <= 7 * DAY_MS) {
    return { ...base, status: "error", title: leftTitle };
  }
  // 체인 신뢰 오류 등은 Node 신뢰 목록 차이일 수 있어 긴급으로 두지 않는다
  if (authorizationError) {
    return { ...base, status: "warn", title: `HTTPS 인증서 검증 경고 (${authorizationError})` };
  }
  if (remaining <= lifetime / 4) {
    return { ...base, status: "warn", title: leftTitle };
  }
  return { ...base, status: "ok", title: "HTTPS 인증서 정상" };
}

// ─────────────────────────────────────────────
// 접속: 대상 하나에 TLS 핸드셰이크 후 인증서만 읽고 바로 끊는다
// ─────────────────────────────────────────────
function parseCertDate(preferred: unknown, raw: unknown): Date | null {
  if (preferred instanceof Date && !Number.isNaN(preferred.getTime())) return preferred;
  if (typeof raw === "string") {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

function firstValue(v: string | string[] | undefined): string {
  return Array.isArray(v) ? (v[0] ?? "") : (v ?? "");
}

function readCertFrom(host: string, servername: string): Promise<CertInfo> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const socket = tls.connect({
      host,
      port: 443,
      servername,
      rejectUnauthorized: false, // 이 접속에만 적용. 검증 결과는 authorized/authorizationError 로 받는다
      timeout: CONNECT_TIMEOUT_MS,
    });

    const finish = (err: Error | null, info?: CertInfo) => {
      if (settled) return;
      settled = true;
      clearTimeout(hardTimer);
      socket.destroy();
      if (err) reject(err);
      else resolve(info!);
    };

    // 핸드셰이크가 조금씩 진행돼 유휴 timeout 이 안 걸리는 경우까지 막는 상한
    const hardTimer = setTimeout(() => finish(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), CONNECT_TIMEOUT_MS);

    // destroy 뒤 늦게 오는 error 까지 받도록 once 가 아닌 on 으로 둔다
    socket.on("error", (e) => finish(e));
    socket.on("timeout", () => finish(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    socket.once("secureConnect", () => {
      try {
        const cert = socket.getPeerCertificate() as tls.PeerCertificate & {
          validFromDate?: Date;
          validToDate?: Date;
        };
        const notBefore = parseCertDate(cert?.validFromDate, cert?.valid_from);
        const notAfter = parseCertDate(cert?.validToDate, cert?.valid_to);
        if (!cert || !notBefore || !notAfter) {
          finish(Object.assign(new Error("bad cert"), { code: "CERT_PARSE_FAILED" }));
          return;
        }
        const authErr = socket.authorizationError as unknown;
        finish(null, {
          notBefore,
          notAfter,
          issuerO: firstValue(cert.issuer?.O),
          issuerCN: firstValue(cert.issuer?.CN),
          subjectAltName: cert.subjectaltname ?? "",
          authorized: socket.authorized,
          authorizationError: authErr
            ? String((authErr as { code?: string }).code ?? authErr)
            : null,
        });
      } catch (e) {
        finish(e as Error);
      }
    });
  });
}

function errCode(e: unknown): string {
  if (typeof e === "object" && e && "code" in e) return String((e as { code: unknown }).code);
  return "UNKNOWN";
}

// 환경 변수의 대상을 순서대로 시도한다. 첫 대상 성공이면 primary, 다음 대상이면 fallback.
export async function fetchPeerCert(): Promise<{ info: CertInfo; via: "primary" | "fallback" } | null> {
  const hosts = (process.env.CERT_CHECK_HOSTS || "vanam.synology.me,192.168.0.210")
    .split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  const servername = process.env.CERT_CHECK_SERVERNAME || "vanam.synology.me";

  for (let i = 0; i < hosts.length; i++) {
    try {
      const info = await readCertFrom(hosts[i], servername);
      return { info, via: i === 0 ? "primary" : "fallback" };
    } catch (e) {
      // 실패 코드만 짧게 남긴다 (인증서 전문·스택 없음)
      console.warn(`[cert-check] 대상 #${i + 1} 실패: ${errCode(e)}`);
    }
  }
  return null;
}

// ─────────────────────────────────────────────
// 캐시 (모듈 메모리)
// ─────────────────────────────────────────────
let lastSuccess: { info: CertInfo; via: "primary" | "fallback"; at: number } | null = null;
let lastAttempt: { ok: boolean; at: number } | null = null;
let inflight: Promise<void> | null = null;

function isFresh(now: number): boolean {
  if (!lastAttempt) return false;
  const ttl = lastAttempt.ok ? SUCCESS_TTL_MS : RETRY_AFTER_FAIL_MS;
  return now - lastAttempt.at < ttl;
}

async function refresh(): Promise<void> {
  // 동시에 여러 요청이 와도 접속은 한 번만
  if (!inflight) {
    inflight = (async () => {
      const result = await fetchPeerCert();
      const at = Date.now();
      if (result) lastSuccess = { ...result, at };
      lastAttempt = { ok: !!result, at };
    })().finally(() => {
      inflight = null;
    });
  }
  return inflight;
}

export async function getCertStatus(): Promise<CertStatusResult> {
  if (!isFresh(Date.now())) await refresh();

  const now = new Date();
  if (!lastSuccess || now.getTime() - lastSuccess.at > STALE_LIMIT_MS) {
    return {
      status: "unknown",
      title: "HTTPS 인증서 확인 실패",
      detail: "인프라 · 포털 서버에서 인증서를 읽지 못함",
      expiresAt: null,
      expiresAtKst: null,
      daysLeft: null,
      lifetimeDays: null,
      issuer: null,
      checkedAt: lastAttempt ? new Date(lastAttempt.at).toISOString() : null,
      via: null,
    };
  }

  const { info, via, at } = lastSuccess;
  const j = judgeCert({
    notBefore: info.notBefore,
    notAfter: info.notAfter,
    authorizationError: info.authorizationError,
    now,
  });
  const issuer = [info.issuerO, info.issuerCN && `(${info.issuerCN})`].filter(Boolean).join(" ") || null;
  return {
    status: j.status,
    title: j.title,
    detail: j.detail,
    expiresAt: info.notAfter.toISOString(),
    expiresAtKst: formatKst(info.notAfter),
    daysLeft: j.daysLeft,
    lifetimeDays: j.lifetimeDays,
    issuer,
    checkedAt: new Date(at).toISOString(),
    via,
  };
}
