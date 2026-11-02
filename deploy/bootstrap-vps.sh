#!/usr/bin/env bash
# =============================================================================
# Prepara uma VPS Ubuntu 24.04 LTS nova para rodar o Marinho Gestão.
#
# O que este script faz, na ordem:
#   1. atualiza o sistema;
#   2. cria o usuário "deploy", com sudo e acesso só por chave SSH;
#   3. desliga o login do root e o login por senha no SSH;
#   4. liga o firewall (ufw) deixando entrar só as portas 22, 80 e 443;
#   5. liga as atualizações automáticas de segurança;
#   6. instala o Docker Engine e o plugin Compose;
#   7. instala o fail2ban, que bloqueia quem erra a senha do SSH muitas vezes;
#   8. cria a pasta /opt/marinho.
#
# Como usar (do seu computador):
#   scp deploy/bootstrap-vps.sh root@IP_DA_VPS:/root/
#   ssh root@IP_DA_VPS
#   bash /root/bootstrap-vps.sh
#
# Opcional: passe uma chave pública extra para o usuário deploy:
#   DEPLOY_SSH_KEY="ssh-ed25519 AAAA... lucas@notebook" bash /root/bootstrap-vps.sh
#
# Pode rodar de novo quantas vezes quiser: cada passo confere o que já existe
# antes de mudar (isso se chama "idempotente").
#
# IMPORTANTE: antes de fechar a sessão do root, abra OUTRO terminal e confira
# que "ssh deploy@IP_DA_VPS" funciona. Se não funcionar, você ainda tem a
# sessão do root aberta para consertar.
# =============================================================================

# -E: os "trap" de erro valem dentro das funções também.
# -e: para o script no primeiro comando que falhar.
# -u: trata variável não definida como erro (pega erro de digitação).
# -o pipefail: um "a | b" falha se qualquer parte falhar, não só a última.
set -Eeuo pipefail

# Nome do usuário que vai operar o servidor (e que o GitHub Actions usa no deploy).
DEPLOY_USER="deploy"
# Pasta onde ficam o docker-compose.yml, o Caddyfile e o .env de produção.
APP_DIR="/opt/marinho"
# Tamanho do arquivo de swap: memória extra no disco, para a VPS não travar se a RAM acabar.
SWAP_SIZE="2G"
# Hora (em UTC) em que a VPS pode reiniciar sozinha depois de uma atualização
# que exige reinício. 07:30 UTC = 04:30 em Maceió, depois do backup (03:00)
# e da limpeza de documentos (03:30).
REBOOT_TIME_UTC="07:30"
# Chave pública extra, vinda da variável de ambiente (vazia se não foi passada).
DEPLOY_SSH_KEY="${DEPLOY_SSH_KEY:-}"

# Função para imprimir cada etapa com destaque, para você acompanhar.
step() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
# Função para avisos que pedem sua atenção.
warn() { printf '\033[1;33m[aviso] %s\033[0m\n' "$*"; }
# Função que imprime o erro e encerra o script.
die() { printf '\033[1;31m[erro] %s\033[0m\n' "$*" >&2; exit 1; }

# Se qualquer comando falhar, mostra a linha, para ficar fácil achar o problema.
trap 'die "o comando da linha $LINENO falhou"' ERR

# -----------------------------------------------------------------------------
step "0. Conferindo onde estamos"
# -----------------------------------------------------------------------------

# O script mexe no sistema inteiro, então precisa rodar como root (id 0).
[[ $EUID -eq 0 ]] || die "rode como root: sudo bash $0"

# Lê o arquivo que descreve a distribuição (define ID, VERSION_ID, VERSION_CODENAME...).
# shellcheck disable=SC1091
. /etc/os-release
# Só foi testado no Ubuntu 24.04; em outra versão, avisa mas continua.
if [[ ${ID:-} != ubuntu || ${VERSION_ID:-} != "24.04" ]]; then
	warn "este script foi pensado para Ubuntu 24.04; aqui é ${PRETTY_NAME:-desconhecido}"
fi

# Diz ao apt para nunca abrir perguntas na tela (o script roda sem interação).
export DEBIAN_FRONTEND=noninteractive

# -----------------------------------------------------------------------------
step "1. Atualizando o sistema"
# -----------------------------------------------------------------------------

# Baixa a lista mais recente de pacotes disponíveis.
apt-get update -q
# Instala as atualizações pendentes, mantendo os arquivos de configuração atuais.
apt-get -q -y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade
# Instala as ferramentas usadas nos próximos passos:
#   ca-certificates e curl: baixar com HTTPS as chaves do repositório do Docker;
#   ufw: firewall simples; fail2ban: bloqueio de ataques ao SSH;
#   unattended-upgrades: atualizações automáticas de segurança.
apt-get -q -y install ca-certificates curl ufw fail2ban unattended-upgrades

# -----------------------------------------------------------------------------
step "2. Usuário $DEPLOY_USER"
# -----------------------------------------------------------------------------

# Cria o usuário só se ele ainda não existir ("id" falha quando não existe).
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
	# --disabled-password: sem senha por enquanto (não dá para entrar por senha);
	# --gecos "": não pergunta nome completo, telefone etc.
	adduser --disabled-password --gecos "" "$DEPLOY_USER"
fi
# Coloca o usuário no grupo "sudo", que pode rodar comandos como root.
usermod -aG sudo "$DEPLOY_USER"

# Pasta das chaves SSH do usuário (o "~" dele).
DEPLOY_HOME="$(getent passwd "$DEPLOY_USER" | cut -d: -f6)"
AUTHORIZED_KEYS="$DEPLOY_HOME/.ssh/authorized_keys"
# Cria a pasta .ssh com permissão 700 (só o dono lê) e o arquivo de chaves.
install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$DEPLOY_HOME/.ssh"
touch "$AUTHORIZED_KEYS"

# Copia para o deploy as chaves que hoje entram como root (o painel da VPS
# costuma colocar a sua chave lá). Cada linha é copiada uma vez só.
if [[ -f /root/.ssh/authorized_keys ]]; then
	while IFS= read -r line; do
		# Alguns provedores põem opções antes da chave (ex.: command="echo use o
		# usuário ubuntu"), que bloqueariam o login. Fica só a partir do tipo da chave.
		key="$(grep -oE '(ssh-|ecdsa-|sk-)[^ ]+ [^ ]+( .*)?$' <<<"$line" || true)"
		# Pula linhas vazias, comentários e o que não for chave.
		[[ -z $key ]] && continue
		# Só acrescenta se a linha exata ainda não estiver no arquivo.
		grep -qxF "$key" "$AUTHORIZED_KEYS" || printf '%s\n' "$key" >>"$AUTHORIZED_KEYS"
	done </root/.ssh/authorized_keys
fi
# Acrescenta a chave extra passada em DEPLOY_SSH_KEY, se houver.
if [[ -n $DEPLOY_SSH_KEY ]]; then
	grep -qxF "$DEPLOY_SSH_KEY" "$AUTHORIZED_KEYS" || printf '%s\n' "$DEPLOY_SSH_KEY" >>"$AUTHORIZED_KEYS"
fi
# O SSH recusa chaves se as permissões estiverem abertas demais: 600 e dono certo.
chmod 600 "$AUTHORIZED_KEYS"
chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTHORIZED_KEYS"

# Trava de segurança: sem nenhuma chave, desligar o login por senha deixaria
# todo mundo (inclusive você) do lado de fora. Então o script para aqui.
if ! grep -qE '^(ssh-|ecdsa-|sk-)' "$AUTHORIZED_KEYS"; then
	die "o usuário $DEPLOY_USER não tem nenhuma chave SSH. Rode de novo com DEPLOY_SSH_KEY=\"sua chave pública\""
fi

# O sudo pede a senha do próprio usuário. Se o deploy ainda não tem senha,
# pede uma agora (ela serve só para o sudo; o SSH continua só por chave).
# "passwd -S" mostra o estado: P = tem senha; L ou NP = travado ou sem senha.
if [[ $(passwd -S "$DEPLOY_USER" | awk '{print $2}') != P ]]; then
	# Só dá para perguntar se há um terminal (-t 0 = a entrada é um teclado).
	if [[ -t 0 ]]; then
		echo "Escolha a senha do sudo para o usuário $DEPLOY_USER (guarde no gerenciador de senhas):"
		passwd "$DEPLOY_USER"
	else
		warn "rode 'passwd $DEPLOY_USER' depois: sem senha, o $DEPLOY_USER não consegue usar sudo"
	fi
fi

# -----------------------------------------------------------------------------
step "3. Endurecendo o SSH"
# -----------------------------------------------------------------------------

# No Ubuntu 24.04, o sshd lê os arquivos de /etc/ssh/sshd_config.d/ em ordem
# alfabética, e vale o PRIMEIRO valor encontrado. O prefixo "00-" garante que
# estas linhas ganhem de outros arquivos (como o 50-cloud-init.conf, que
# alguns provedores criam liberando senha).
cat >/etc/ssh/sshd_config.d/00-marinho.conf <<'EOF'
# Criado pelo bootstrap-vps.sh do Marinho Gestão.
# Ninguém entra direto como root; entre como deploy e use sudo.
PermitRootLogin no
# Sem login por senha: só chave SSH.
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
# Poucas tentativas por conexão, para dificultar quem tenta adivinhar.
MaxAuthTries 3
# Sem janelas gráficas pelo SSH (não usamos).
X11Forwarding no
EOF
# Confere se a configuração é válida ANTES de aplicar; se tiver erro, para aqui.
sshd -t
# Recarrega o SSH com as regras novas. As conexões abertas (esta inclusive)
# continuam funcionando.
systemctl reload ssh

# -----------------------------------------------------------------------------
step "4. Firewall (ufw): só 22, 80 e 443"
# -----------------------------------------------------------------------------

# Por padrão, bloqueia tudo o que chega e libera tudo o que sai.
ufw default deny incoming
ufw default allow outgoing
# 22/tcp: SSH. Liberado ANTES de ligar o firewall, senão você perde o acesso.
ufw allow 22/tcp comment 'SSH'
# 80/tcp: HTTP. O Caddy usa para emitir o certificado e redirecionar para HTTPS.
ufw allow 80/tcp comment 'HTTP (Caddy)'
# 443/tcp e 443/udp: HTTPS (o udp é o HTTP/3, que o Caddy também atende).
ufw allow 443/tcp comment 'HTTPS (Caddy)'
ufw allow 443/udp comment 'HTTP/3 (Caddy)'
# Liga o firewall sem perguntar "tem certeza?" (--force).
ufw --force enable
# ATENÇÃO: portas publicadas pelo Docker ("ports:" no compose) passam POR FORA
# do ufw. Por isso o Postgres não tem "ports:" no docker-compose.yml: nunca
# publique outra porta lá sem pensar nisso.

# -----------------------------------------------------------------------------
step "5. Atualizações automáticas de segurança"
# -----------------------------------------------------------------------------

# Liga a atualização diária da lista de pacotes e a instalação automática.
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
EOF
# Ajustes do Marinho: reinicia sozinho quando uma atualização exigir (ex.: kernel),
# no horário definido lá em cima, e remove pacotes que ficaram sem uso.
cat >/etc/apt/apt.conf.d/52marinho-unattended-upgrades <<EOF
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "$REBOOT_TIME_UTC";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
EOF
# Garante que o serviço está ligado e liga junto com a máquina.
systemctl enable --now unattended-upgrades

# -----------------------------------------------------------------------------
step "6. Docker Engine e Docker Compose"
# -----------------------------------------------------------------------------

# Pasta onde o apt guarda chaves de repositórios de terceiros.
install -m 0755 -d /etc/apt/keyrings
# Baixa a chave oficial do Docker, que prova que os pacotes vieram mesmo deles.
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
# Cadastra o repositório oficial do Docker para esta arquitetura e versão do Ubuntu.
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
	>/etc/apt/sources.list.d/docker.list
# Atualiza a lista e instala o Docker Engine, a linha de comando e o plugin Compose.
apt-get update -q
apt-get -q -y install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Configuração do Docker:
#   log-driver/log-opts: guarda no máximo 5 arquivos de 10 MB de log por container,
#     para os logs não encherem o disco;
#   live-restore: os containers continuam rodando enquanto o próprio Docker é
#     atualizado ou reiniciado.
DAEMON_JSON='{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "5" },
  "live-restore": true
}'
# Só reescreve (e reinicia o Docker) se o conteúdo mudou.
if [[ ! -f /etc/docker/daemon.json ]] || [[ "$(cat /etc/docker/daemon.json)" != "$DAEMON_JSON" ]]; then
	printf '%s\n' "$DAEMON_JSON" >/etc/docker/daemon.json
	systemctl restart docker
fi
# Liga o Docker junto com a máquina, para os containers voltarem após um reinício.
systemctl enable --now docker containerd
# Deixa o deploy usar o docker sem sudo. Atenção: quem está no grupo docker
# tem, na prática, poder de root. Por isso só o deploy entra nele.
usermod -aG docker "$DEPLOY_USER"

# -----------------------------------------------------------------------------
step "7. fail2ban"
# -----------------------------------------------------------------------------

# Bloqueia por 1 hora o IP que errar o login do SSH 5 vezes em 10 minutos.
# backend = systemd: lê as tentativas direto do journal do sistema.
cat >/etc/fail2ban/jail.d/marinho-sshd.local <<'EOF'
[sshd]
enabled = true
backend = systemd
maxretry = 5
findtime = 10m
bantime = 1h
EOF
# Liga o fail2ban e recarrega para ler a regra nova.
systemctl enable --now fail2ban
systemctl restart fail2ban

# -----------------------------------------------------------------------------
step "8. Swap e pasta do sistema"
# -----------------------------------------------------------------------------

# Cria o swap só se a VPS ainda não tiver nenhum ("swapon --show" vazio).
if [[ -z $(swapon --show --noheadings) ]]; then
	# Reserva o arquivo no disco.
	fallocate -l "$SWAP_SIZE" /swapfile
	# Só o root pode ler o swap (ele pode conter pedaços da memória).
	chmod 600 /swapfile
	# Formata o arquivo como swap e liga.
	mkswap /swapfile
	swapon /swapfile
	# Registra no /etc/fstab para ligar de novo depois de reiniciar.
	grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
fi
# swappiness 10: só usa o swap quando a RAM estiver de fato acabando.
echo 'vm.swappiness=10' >/etc/sysctl.d/99-marinho.conf
sysctl -q --system

# Cria /opt/marinho, do usuário deploy, sem acesso para outros usuários (750).
install -d -m 750 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "$APP_DIR"

# -----------------------------------------------------------------------------
step "Pronto"
# -----------------------------------------------------------------------------

# Resumo do que ficou configurado, para conferir.
echo "Docker:   $(docker --version)"
echo "Compose:  $(docker compose version)"
echo "Firewall:"
ufw status | sed 's/^/  /'
cat <<EOF

Próximos passos (docs/operacao/primeiro-deploy.md):
  1. Em OUTRO terminal, teste: ssh $DEPLOY_USER@<IP_DA_VPS>
  2. Lá dentro, confira o docker sem sudo: docker ps
  3. Só depois feche esta sessão do root.
EOF
