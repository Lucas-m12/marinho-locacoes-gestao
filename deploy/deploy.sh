#!/usr/bin/env bash
# Publica uma versão da API na VPS, ou volta para a anterior.
#
#   ./deploy.sh sha-<commit>   baixa a imagem, roda as migrations, sobe server e jobs
#                              e espera o /health; se falhar, volta sozinho.
#   ./deploy.sh rollback       volta para a versão anterior ao último deploy,
#                              sem rodar migrations.
#
# Fica em /opt/marinho, ao lado do docker-compose.yml, do Caddyfile e do .env.
# O deploy do GitHub Actions copia este arquivo e o chama por SSH.

set -Eeuo pipefail
cd "$(dirname "$0")"

ENV_FILE=.env
PREVIOUS_FILE=.previous-image-tag
HEALTH_TIMEOUT_SECONDS=${HEALTH_TIMEOUT_SECONDS:-120}

log() { printf '[deploy %s] %s\n' "$(date -u +%H:%M:%S)" "$*"; }
fail() { log "ERRO: $*"; exit 1; }

env_value() { sed -n "s/^$1=//p" "$ENV_FILE" | tail -n 1; }

set_tag() {
	if grep -q '^IMAGE_TAG=' "$ENV_FILE"; then
		sed -i.bak "s/^IMAGE_TAG=.*/IMAGE_TAG=$1/" "$ENV_FILE" && rm -f "$ENV_FILE.bak"
	else
		printf 'IMAGE_TAG=%s\n' "$1" >>"$ENV_FILE"
	fi
}

ensure_image() {
	local image
	image="$(env_value SERVER_IMAGE):$1"
	if docker image inspect "$image" >/dev/null 2>&1; then
		log "imagem $image já está na VPS"
	else
		log "baixando $image"
		docker compose pull --quiet server
	fi
}

wait_healthy() {
	local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS)) container status
	while ((SECONDS < deadline)); do
		container="$(docker compose ps -q server)"
		status="$(docker inspect -f '{{.State.Health.Status}}' "$container" 2>/dev/null || echo starting)"
		if [[ $status == healthy ]]; then return 0; fi
		sleep 3
	done
	return 1
}

start_services() {
	docker compose up -d --remove-orphans
	docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 ||
		log "aviso: o Caddy não recarregou o Caddyfile; confira com docker compose logs caddy"
}

prune_old_images() {
	local repository keep_current="$1" keep_previous="$2"
	repository="$(env_value SERVER_IMAGE)"
	docker image ls "$repository" --format '{{.Tag}}' |
		{ grep -vxF -e "$keep_current" -e "$keep_previous" -e '<none>' || true; } |
		while read -r tag; do docker image rm "$repository:$tag" >/dev/null 2>&1 || true; done
	docker image prune -f >/dev/null || true
}

has_image() { docker image inspect "$(env_value SERVER_IMAGE):$1" >/dev/null 2>&1; }

deploy() {
	local target="$1" original previous=""
	original="$(env_value IMAGE_TAG)"
	if [[ -n $original && $original != "$target" ]] && has_image "$original"; then
		previous="$original"
	fi
	log "versão atual: ${previous:-nenhuma}; nova: $target"

	set_tag "$target"
	if ! ensure_image "$target"; then
		set_tag "$original"
		fail "não consegui baixar a imagem $target"
	fi

	log "aplicando migrations"
	if ! docker compose run --rm migrate; then
		set_tag "$original"
		fail "as migrations falharam; nada foi trocado"
	fi

	log "subindo server e jobs"
	start_services
	if wait_healthy; then
		[[ -z $previous ]] || printf '%s\n' "$previous" >"$PREVIOUS_FILE"
		prune_old_images "$target" "${previous:-$target}"
		log "pronto: $target no ar"
		return 0
	fi

	log "o /health não respondeu em ${HEALTH_TIMEOUT_SECONDS}s"
	docker compose logs --tail 80 server || true
	if [[ -z $previous ]]; then
		fail "deploy de $target falhou e não há versão anterior para voltar"
	fi
	log "voltando para $previous"
	set_tag "$previous"
	start_services
	wait_healthy || log "a versão $previous também não ficou saudável; confira os logs"
	fail "deploy de $target desfeito"
}

rollback() {
	[[ -f $PREVIOUS_FILE ]] || fail "não há versão anterior registrada em $PREVIOUS_FILE"
	local target current
	target="$(cat "$PREVIOUS_FILE")"
	current="$(env_value IMAGE_TAG)"
	log "voltando de $current para $target (sem migrations)"
	set_tag "$target"
	ensure_image "$target" || { set_tag "$current"; fail "não consegui baixar $target"; }
	start_services
	wait_healthy || fail "$target não ficou saudável; confira docker compose logs server"
	printf '%s\n' "$current" >"$PREVIOUS_FILE"
	log "pronto: $target no ar (a anterior agora é $current)"
}

[[ -f $ENV_FILE ]] || fail "falta o $ENV_FILE em $(pwd)"
case "${1:-}" in
rollback) rollback ;;
sha-* | latest) deploy "$1" ;;
*) fail "uso: ./deploy.sh sha-<commit> | rollback" ;;
esac
