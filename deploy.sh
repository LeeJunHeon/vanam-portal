#!/bin/bash
cd /volume1/docker/portal
git pull
export BUILDX_GIT_INFO=0
sudo docker compose build nextjs
sudo /usr/syno/bin/synowebapi --exec api=SYNO.Docker.Container method="stop" version=1 name="portal-nextjs"
sudo docker compose up -d nextjs
echo "배포 완료!"
