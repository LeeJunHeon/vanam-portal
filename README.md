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
| translator | 회의 관리 | /translator | `TRANSLATOR_HEALTH_URL` (기본 http://192.168.0.83:8790/translator/healthz) |
| assistant | 업무 관리 | /assistant | `ASSISTANT_HEALTH_URL` (기본 http://ai-assistant-web:8000/assistant/healthz) |

- 업무 관리는 Python 앱(NAS 컨테이너 `ai-assistant-web:8000`)이다. 포털 로그인 쿠키로 인사 앱 `/hr/api/me` 를 확인해 로그인하고, `portal-menus`(할 일·내 업무 메모)와 `?page=tasks|memo` 딥링크, 로그인 없는 `GET /assistant/healthz` 를 제공한다. `/api/portal-summary` 대신 `GET /assistant/api/today` 를 브라우저에서 불러 앱 카드 요약(신규·오늘 마감·진행)과 첫 화면 '내 업무' 카드에 쓴다(401·403·오류면 설명 문구만 나오고 '내 업무' 카드는 숨긴다).
- 포털 컨테이너(`portal-nextjs`)는 `docker-compose.yml` 에서 외부 네트워크 `vanam-db-net` 에 붙어 있다. 업무 관리 컨테이너도 `vanam-db-net` 에 있으므로 포털은 컨테이너 이름 `ai-assistant-web` 으로 바로 닿는다. 업무 관리가 다른 네트워크로 옮겨지면 `ASSISTANT_HEALTH_URL` 을 바꾼다.
- 저장된 사용자 앱 순서에 새 앱이 없으면 `normalizeAppOrder` 가 기본 순서대로 뒤에 붙인다.
- 앱 순서 바꾸기: 1024px 이상은 왼쪽 앱 열 마지막 카드 아래 [앱 순서 편집] → 끌어서 옮기기 → [완료], 1024px 미만은 칩 줄 위 [순서 편집] → 시트에서 ↑ ↓ (옮길 때마다 바로 저장).

## 첫 화면

- 1024px 이상(3단, 가운데 정렬, 최대 1420px): 왼쪽 앱 카드 | 가운데 즐겨찾기·자주 쓰는 메뉴·전체 메뉴·활동 로그 | 오른쪽 열(310px)에 위에서부터 업무 관리 '내 업무' → 알림 → 서버 상태.
- 1024px 미만: 같은 '내 업무' 카드가 맨 위에 온다. 상단바 [내 할 일] 버튼(640px 미만은 아이콘 + 숫자)은 카드로 스크롤해 '할 일' 탭을 고른다.
- '내 업무' 카드는 [할 일 N] [일정 M] 탭이다(할 일이 있으면 '할 일', 없으면 '일정' 탭으로 열고, 선택은 저장하지 않는다). 업무 관리 명단에 없는 사람(401·403)·오류일 때는 이 카드만 빠지고 알림·서버 상태는 그대로 있다.
  - 할 일: 오늘까지·이번 주·나중·기한 없음으로 묶어 최대 8줄(체크하면 `POST /assistant/api/tasks/{id}/status` 로 완료, 토스트 [되돌리기]). 배지는 신규·지남 MM-DD·오늘·MM-DD 요일.
  - 일정: today 응답의 `schedule`(`days` 7일, `events` 에 내 일정·팀 일정, `date`~`end_date`)을 7일 날짜 띠로 고른 날마다 최대 8줄. 오늘 칸은 지난 시각 일정을 흐리게 한다. `schedule` 이 없는 이전 업무 관리 응답이면 `events`(오늘 내 일정)·`team_events` 로 만든다.
  - [전체 보기]는 할 일 탭이면 `/assistant/?page=tasks`, 일정 탭이면 `/assistant/?page=team`.
- `/assistant/api/today` 요청은 첫 화면 스크립트가 읽히는 즉시 시작한다. 마지막 응답은 sessionStorage(`portalToday:<KST 날짜>`, 10분)에 두었다가 먼저 그리고, 없으면 같은 모양의 자리표시를 둔다. 401·403·로그아웃 때 지운다.

## 배포 (NAS)

이미지는 NAS 에서 빌드하지 않는다. main 에 push 하면 GitHub Actions(`.github/workflows/docker-publish.yml`)가 이미지를 빌드해
`ghcr.io/leejunheon/vanam-portal:<커밋 SHA>`·`:latest` 로 올리고, NAS 는 그 이미지를 받아 재시작만 한다.

1. push 뒤 Actions 가 성공했는지 본다: https://github.com/LeeJunHeon/vanam-portal/actions
2. NAS `/volume1/docker/portal` 에서 `sudo ./deploy.sh` — git pull → 그 커밋 이미지 받기 → `:deployed` 로 바꾸기 → `docker compose up -d` → 실행 확인(옛 이미지는 지우지 않는다).
   그 커밋 이미지가 아직 없으면(빌드 중·실패·로그인 안 됨) Actions 주소를 안내하고 아무것도 바꾸지 않은 채 멈춘다.
3. 문제가 있으면 `rollback` 인자 — 바로 전 이미지(`:previous`)와 맞바꾼다(git pull 하지 않음).
4. GitHub 을 쓸 수 없을 때만 `--build` 인자(비상용) — 예전처럼 NAS 에서 직접 빌드해 `:deployed` 로 쓴다.
5. **한 번에 한 앱씩 배포한다**(다른 앱 배포 중이면 멈춘다). NAS 1분 평균 부하가 6 초과이거나 여유 메모리가 500MB 미만이면
   시작하지 않는다 — 확인하고 꼭 해야 할 때만 `sudo GHCR_FORCE=1 ./deploy.sh`(rollback·--build 와 같이 쓸 수 있다). 옛 이미지는 새벽 야간 정리 작업이 지운다.
- git pull 전에 NAS 에서 직접 고친 추적 파일이 있으면 멈춘다(내용을 GitHub 코드로 옮긴 뒤 `git checkout -- <파일>`).

- 처음 한 번: NAS 에서 `sudo git pull`(새 배포 스크립트 받기) → `sudo docker login ghcr.io`(GitHub 사용자 이름 + `read:packages` 권한
  토큰. 공개 저장소 이미지는 로그인 없이도 받을 수 있다) → 배포. 처음에는 `:previous` 가 없어 되돌리기는 `--build` 로 한다.
- 배포 기록은 앱 폴더의 `.deploy-state`(git 에 넣지 않음)에 이미지마다 현재·이전 커밋 SHA 와 시각으로 남는다. 공용 함수는 `scripts/ghcr-deploy.sh`.
- 예전에 NAS 에서 빌드한 이미지(compose 기본 이름)는 자동으로 지우지 않는다. `sudo docker images` 로 확인해 쓰지 않는 것만 지운다.

환경 변수는 `.env.example` 을 참고하고, 비워 둔 항목은 `docker-compose.yml` 의 기본값을 쓴다. 새 앱(예: 업무 관리)은 그 앱 컨테이너와 Caddy 경로가 먼저 떠 있어야 포털에서 메뉴·상태가 보인다.

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
