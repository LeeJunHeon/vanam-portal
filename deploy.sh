#!/bin/bash
set -euo pipefail

APP_DIR="/volume1/docker/portal"
SERVICE="nextjs"
CONTAINER="portal-nextjs"

# 실행 중 git pull 로 이 파일이 바뀌어도 이미 읽은 main 으로 끝까지 돈다
main() {
  # root 가 아니면 sudo -H 로 다시 실행 (root 의 git 설정 /root/.gitconfig 사용)
  if [ "$(id -u)" -ne 0 ]; then
    exec sudo -H bash "$0" "$@"
  fi

  cd "$APP_DIR"

  echo "[1/4] git pull"
  # 폴더 소유자가 달라 생기는 dubious ownership 방지 — 목록에 없을 때만 추가
  local safe_dirs
  safe_dirs="$(git config --global --get-all safe.directory || true)"
  if ! grep -qxF "$APP_DIR" <<<"$safe_dirs"; then
    git config --global --add safe.directory "$APP_DIR"
  fi
  # NAS 에서 직접 고친 추적 파일이 있으면 멈춘다 (추적하지 않는 새 파일은 괜찮다)
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "배포 중단: NAS 에서 직접 고친 파일이 있습니다"
    git status --short --untracked-files=no
    echo "NAS 에서 직접 고친 내용은 GitHub 코드에 먼저 옮긴 뒤 git checkout -- <파일> 로 되돌리고 다시 배포하세요"
    exit 1
  fi
  git pull

  echo "[2/4] docker compose build $SERVICE"
  export BUILDX_GIT_INFO=0
  docker compose build "$SERVICE"

  echo "[3/4] docker compose up -d $SERVICE"
  # 이미지가 바뀌면 up -d 가 컨테이너를 교체한다 (stop 을 먼저 하면 "Running" 만 찍고 안 켜질 수 있음)
  docker compose up -d "$SERVICE"

  echo "[4/4] 실행 확인 ($CONTAINER, 최대 60초)"
  local waited=0 running retried=0
  while true; do
    running="$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo false)"
    if [ "$running" = "true" ]; then
      break
    fi
    if [ "$retried" -eq 0 ]; then
      echo "컨테이너가 실행 중이 아니라 up -d 를 한 번 더 실행합니다"
      docker compose up -d "$SERVICE"
      retried=1
    fi
    if [ "$waited" -ge 60 ]; then
      docker ps -a --filter "name=$CONTAINER" || true
      docker logs --tail 30 "$CONTAINER" || true
      echo "배포 실패: 컨테이너가 실행 중이 아님"
      exit 1
    fi
    sleep 5
    waited=$((waited + 5))
  done

  git log --oneline -1
  docker ps --filter "name=$CONTAINER" --format '{{.Names}}  {{.Status}}'
  echo "배포 완료!"
}

main "$@"
