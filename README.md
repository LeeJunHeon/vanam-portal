# 바남 포털 (vanam-portal)

사내 앱을 한 화면에서 여는 포털이다. 앱은 모두 같은 주소의 경로로 붙는다 (Caddy 가 경로별로 넘긴다).

## 앱 목록

앱 정보는 `lib/portal-apps.ts`, 앱 키는 `lib/launcher.ts` 의 `APP_KEYS` 에 있다. 런처 메뉴는 각 앱의 `GET <경로>/api/portal-menus` 로 받고, 앱 카드의 운영 상태는 `/api/nas-status` 헬스체크(`lib/nas-monitor.ts`)로 정한다.

| 키 | 이름 | 경로 | 상태 확인 대상 |
|---|---|---|---|
| inventory | 재고 관리 | /inventory | http://inventory-web-nextjs:3000 |
| equipment | 장비 관리 | /equipment | http://equipment-web-nextjs:3003 |
| hr | 인사 관리 | /hr | http://hr-nextjs:3000 |
| office | 경영 지원 (admin·CEO 전용) | /office | http://office-web-nextjs:3000 |
| process | 공정 관리 | /process | http://process-web-nextjs:3000 |
| translator | 실시간 통역 | /translator | `TRANSLATOR_HEALTH_URL` (기본 http://192.168.0.83:8790/translator/healthz) |
| assistant | 업무 비서 | /assistant | `ASSISTANT_HEALTH_URL` (기본 http://ai-assistant-web:8000/assistant/healthz) |

- 업무 비서는 Python 앱(NAS 컨테이너 `ai-assistant-web:8000`)이다. 포털 로그인 쿠키로 인사 앱 `/hr/api/me` 를 확인해 로그인하고, `portal-menus`(할 일·내 업무 메모)와 `?page=tasks|memo` 딥링크, 로그인 없는 `GET /assistant/healthz` 를 제공한다. `/api/portal-summary` 는 없어서 앱 카드에는 설명 문구만 나온다.
- 포털 컨테이너(`portal-nextjs`)는 `docker-compose.yml` 에서 외부 네트워크 `vanam-db-net` 에 붙어 있다. 업무 비서 컨테이너도 `vanam-db-net` 에 있으므로 포털은 컨테이너 이름 `ai-assistant-web` 으로 바로 닿는다. 업무 비서가 다른 네트워크로 옮겨지면 `ASSISTANT_HEALTH_URL` 을 바꾼다.
- 저장된 사용자 앱 순서에 새 앱이 없으면 `normalizeAppOrder` 가 기본 순서대로 뒤에 붙인다.

## 배포 (NAS)

NAS 의 `/volume1/docker/portal` 에서 `bash deploy.sh` 를 실행한다 (git pull → `docker compose build nextjs` → `docker compose up -d nextjs` → 실행 확인). 환경 변수는 `.env.example` 을 참고하고, 비워 둔 항목은 `docker-compose.yml` 의 기본값을 쓴다. 새 앱(예: 업무 비서)은 그 앱 컨테이너와 Caddy 경로가 먼저 떠 있어야 포털에서 메뉴·상태가 보인다.

---

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
