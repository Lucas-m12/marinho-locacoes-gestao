#!/usr/bin/env bash
# Gera as linhas de base da regressão visual dentro da imagem oficial do Playwright,
# a mesma do CI. Uso, na raiz: bun run e2e:update [argumentos extras do playwright]
# E2E_UPDATE=none só confere as linhas de base, sem regravar.
set -euo pipefail

repo="$(cd "$(dirname "$0")/../../.." && pwd)"
version="$(node -p "require('$repo/apps/e2e/node_modules/@playwright/test/package.json').version")"
bun_version="$(node -p "require('$repo/package.json').packageManager.split('@')[1]")"
image="mcr.microsoft.com/playwright:v${version}-noble"
network="marinho-gestao_default"
snapshots="$repo/apps/e2e/tests/visual/__screenshots__"

docker compose -f "$repo/docker-compose.yml" --profile test up -d --wait postgres-test minio
mkdir -p "$snapshots"

docker run --rm --init --ipc=host \
	--network "$network" \
	-v "$repo":/src:ro \
	-v "$snapshots":/out \
	-e CI=1 \
	-e E2E_SKIP_DOCKER=1 \
	-e TEST_DATABASE_URL=postgresql://postgres:postgres@postgres-test:5432/marinho_test \
	-e DATABASE_URL=postgresql://postgres:postgres@postgres-test:5432/marinho_test \
	-e S3_ENDPOINT=http://minio:9000 \
	-e BUN_VERSION="$bun_version" \
	-e E2E_UPDATE="${E2E_UPDATE:-all}" \
	"$image" bash -euo pipefail -c '
		apt-get update -qq >/dev/null && apt-get install -y -qq unzip >/dev/null
		curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" >/dev/null
		export PATH="$HOME/.bun/bin:$PATH"
		mkdir -p /work
		cd /src
		tar --exclude=./node_modules --exclude="*/node_modules" --exclude="*/dist" \
			--exclude=./.turbo --exclude="*/.turbo" --exclude=./apps/e2e/test-results \
			--exclude=./apps/e2e/visual-output --exclude=./apps/e2e/.auth \
			--exclude="./apps/*/.env" -cf - . | (cd /work && tar xf -)
		cd /work
		bun install --frozen-lockfile
		bun run db:generate
		cd apps/e2e
		npx playwright test tests/visual/regressao.spec.ts --update-snapshots="${E2E_UPDATE:-all}" --reporter=line "$@"
		if [ "${E2E_UPDATE:-all}" != "none" ]; then cp -R tests/visual/__screenshots__/. /out/; fi
	' bash "$@"

echo "Linhas de base atualizadas em $snapshots"
