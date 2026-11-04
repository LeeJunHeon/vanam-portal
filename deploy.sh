#!/bin/bash
# 포털 NAS 배포. GitHub Actions 가 올린 이미지(ghcr.io/leejunheon/vanam-portal:<커밋 SHA>)를 받아 재시작만 한다(NAS 에서 빌드하지 않음).
# 사용법: sudo ./deploy.sh            git pull → 그 커밋 이미지 받기 → :deployed 로 바꾸기 → 재시작·실행 확인 → 옛 이미지는 새벽 정리 작업이 처리
#         sudo ./deploy.sh rollback   바로 전 이미지(:previous)로 되돌리기 (git pull 하지 않음)
#         sudo ./deploy.sh --build    (비상용) GitHub 을 쓰지 않고 NAS 에서 직접 빌드
# 처음 한 번 NAS 에서: sudo docker login ghcr.io (공개 저장소 이미지면 로그인 없이도 받을 수 있다)
set -euo pipefail

APP_DIR="/volume1/docker/portal"
SERVICE="nextjs"
CONTAINER="portal-nextjs"
GHCR_CHECK_LOCAL_CHANGES=1 # git pull 전에 NAS 에서 직접 고친 추적 파일이 있으면 멈춘다
GHCR_REPO="LeeJunHeon/vanam-portal"
GHCR_IMAGES=("ghcr.io/leejunheon/vanam-portal")
GHCR_SERVICES=("$SERVICE")

# 공용 배포 함수 — 실행 중 git pull 로 파일이 바뀌어도 이미 읽은 함수로 끝까지 돈다
# shellcheck source=scripts/ghcr-deploy.sh
source "$(dirname "$(readlink -f "$0")")/scripts/ghcr-deploy.sh"

ghcr_standard_main "$@"
