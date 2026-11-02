# Backup e restauração do Postgres

> **Antes do lançamento, faça o teste de restauração da seção 3.** Um backup que nunca foi restaurado é só uma esperança.

## 1. Como o backup funciona

- A tarefa `backup-database` roda **todo dia às 03:00 (Maceió)** no container `jobs`.
- Ela roda `pg_dump --format=custom --compress=zstd:9`, que gera um único arquivo já compactado, e envia para o bucket R2 `marinho-backups` em:

  ```
  postgres/aaaa/mm/dd/marinho-<instante em UTC>.dump
  ex.: postgres/2026/11/03/marinho-20261103T060000Z.dump
  ```

  A pasta usa o dia de Maceió; o nome usa o instante em UTC (o `Z` no fim).
- Arquivos maiores que 32 MB vão em partes (multipart), com nova tentativa automática em caso de falha de rede.
- O tamanho e os tempos de cada backup vão para o log (`sizeBytes`, `dumpMs`, `uploadMs`) e para a tabela `event` (entidade `Job`).
- O bucket apaga sozinho os arquivos com mais de **30 dias** (regra de ciclo de vida em [r2.md](r2.md)). Ficam sempre os 30 últimos.
- O backup cobre o banco inteiro (locações, clientes, caixa, usuários, histórico). **Não cobre** os arquivos do bucket `marinho-prod` (fotos e documentos), que ficam no R2, nem o `/opt/marinho/.env`, que deve ter uma cópia no seu gerenciador de senhas.

### Por que o `pg_dump` roda dentro da imagem do servidor

O `pg_dump` precisa ser da mesma versão principal do Postgres (18) ou mais nova. Havia duas opções:

1. instalar o `postgresql-client-18` na imagem do servidor (escolhida);
2. fazer a tarefa chamar `docker exec` no container do Postgres.

A segunda exigiria montar o `/var/run/docker.sock` dentro do container `jobs`. Quem acessa esse arquivo controla o Docker inteiro, o que na prática é ser root na VPS: uma falha na aplicação viraria acesso total ao servidor. Com o cliente na imagem, o `jobs` só fala com o Postgres pela rede interna, com a senha do banco, e não depende do nome do container. O custo é a imagem levar o cliente do Postgres e as bibliotecas dele, instalados do repositório oficial (PGDG).

A versão fica no `ARG POSTGRES_MAJOR=18` do `apps/server/Dockerfile`. Quando um dia o Postgres for atualizado para a 19, mude esse número junto com a imagem `postgres:` do `docker-compose.yml`.

## 2. Conferir que os backups estão saindo

```bash
cd /opt/marinho
docker compose logs jobs --since 48h | grep backup-database
```

A linha `"message":"job finished"` mostra a chave, o tamanho e os tempos. Ou pelo banco:

```bash
docker compose exec postgres psql -U marinho -d marinho -c \
  "select created_at, payload->>'key' as arquivo, payload->>'sizeBytes' as bytes
   from event where entity = 'Job' and entity_id = 'backup-database'
   order by created_at desc limit 7"
```

E no painel: **R2 → marinho-backups → postgres/**. Se um dia faltar, veja `docker compose logs jobs` e o Sentry. Para rodar um backup agora:

```bash
docker compose exec jobs bun dist/jobs.mjs backup-database
```

## 3. Teste de restauração (no seu computador)

Precisa só do Docker Desktop. Nada aqui mexe na produção.

### 3.1 Baixar um backup

Pelo painel: **R2 → marinho-backups**, entre em `postgres/aaaa/mm/dd/`, clique no arquivo e em **Download**. Guarde numa pasta só para isso:

```bash
mkdir -p ~/marinho-restore
mv ~/Downloads/marinho-*.dump ~/marinho-restore/
ls -lh ~/marinho-restore
```

Pelo terminal (opcional), com o [AWS CLI](https://aws.amazon.com/cli/) e o token **do bucket de backups**:

```bash
export AWS_ACCESS_KEY_ID=...            # R2_BACKUP_ACCESS_KEY_ID
export AWS_SECRET_ACCESS_KEY=...        # R2_BACKUP_SECRET_ACCESS_KEY
export AWS_DEFAULT_REGION=auto
R2=https://SEU_ACCOUNT_ID.r2.cloudflarestorage.com
aws s3 ls s3://marinho-backups/postgres/ --recursive --endpoint-url $R2 | tail -3
aws s3 cp s3://marinho-backups/postgres/2026/11/03/marinho-20261103T060000Z.dump ~/marinho-restore/ --endpoint-url $R2
```

### 3.2 Restaurar num Postgres 18 descartável

```bash
docker run -d --name marinho-restore \
  -e POSTGRES_PASSWORD=restore -p 5440:5432 \
  -v ~/marinho-restore:/backup:ro postgres:18

until docker exec marinho-restore pg_isready -U postgres; do sleep 1; done
sleep 3

docker exec marinho-restore createdb -U postgres marinho
docker exec marinho-restore pg_restore -U postgres -d marinho \
  --no-owner --no-acl --exit-on-error /backup/marinho-20261103T060000Z.dump
```

Sem erro e sem saída: deu certo. Use o Postgres 18 do Docker para restaurar, porque ele já vem com suporte a `zstd`.

### 3.3 Conferir o conteúdo

```bash
docker exec marinho-restore psql -U postgres -d marinho -c \
  "select (select count(*) from rental) locacoes, (select count(*) from customer) clientes,
          (select count(*) from ledger_entry) lancamentos, (select count(*) from \"user\") usuarios,
          (select max(created_at) from event) ultimo_evento"
```

Compare com a produção (na VPS):

```bash
cd /opt/marinho
docker compose exec postgres psql -U marinho -d marinho -c \
  "select (select count(*) from rental) locacoes, (select count(*) from customer) clientes,
          (select count(*) from ledger_entry) lancamentos, (select count(*) from \"user\") usuarios,
          (select max(created_at) from event) ultimo_evento"
```

Os números batem com a produção no horário do backup; o que foi feito depois disso não está nele.

Para ir além, rode o sistema local em cima da cópia (não toque o R2 de produção: deixe o `apps/server/.env` com o bucket `marinho-dev`):

```bash
DATABASE_URL=postgresql://postgres:restore@localhost:5440/marinho bun run dev:server
VITE_DATA_SOURCE=http VITE_SERVER_URL=http://localhost:3000 bun run dev:web
```

Entre com um usuário da produção. Fotos e documentos não abrem, porque estão no bucket de produção. Isso é o esperado.

### 3.4 Limpar

```bash
docker rm -f marinho-restore
rm -rf ~/marinho-restore     # o arquivo tem dados de clientes: não deixe largado
```

Anote a data do teste. Repita a cada 3 meses e sempre que mudar algo no backup.

## 4. Restaurar na produção (desastre)

Só quando o banco de produção estiver perdido ou corrompido. Leia tudo antes de começar; todo mundo fica sem sistema por alguns minutos.

```bash
cd /opt/marinho

# 1. Tire o sistema do ar (o Postgres continua ligado)
docker compose stop server jobs

# 2. Guarde uma cópia do estado atual, mesmo quebrado
docker compose exec -T postgres pg_dump -U marinho -d marinho --format=custom > ~/antes-da-restauracao.dump || true

# 3. Traga o backup para a VPS (do seu computador) e para dentro do container
#    no seu computador: scp ~/marinho-restore/marinho-XXXX.dump deploy@IP_DA_VPS:~/
docker compose cp ~/marinho-XXXX.dump postgres:/tmp/restore.dump

# 4. Recrie o banco vazio e restaure
docker compose exec postgres dropdb -U marinho --maintenance-db=postgres --force marinho
docker compose exec postgres createdb -U marinho --maintenance-db=postgres marinho
docker compose exec postgres pg_restore -U marinho -d marinho --no-owner --exit-on-error /tmp/restore.dump
docker compose exec postgres rm /tmp/restore.dump

# 5. Aplique migrations mais novas que o backup (se houver) e volte ao ar
docker compose run --rm migrate
docker compose up -d server jobs
curl -fsS https://api.marinholocacoes.com/health
```

Depois:

- avise a família que o que foi feito entre o backup e o problema precisa ser lançado de novo;
- apague `~/antes-da-restauracao.dump` e `~/marinho-XXXX.dump` da VPS quando tudo estiver conferido;
- fotos enviadas depois do backup continuam no R2, mas o banco restaurado não as conhece. Elas não aparecem nas telas.

## 5. Se a VPS inteira sumir

1. Crie outra VPS e siga [primeiro-deploy.md](primeiro-deploy.md) dos passos 1 a 3 (troque o IP no DNS e no secret `VPS_HOST`; refaça o `VPS_KNOWN_HOSTS`).
2. Recoloque o `/opt/marinho/.env` a partir da cópia do gerenciador de senhas.
3. Rode o workflow **Deploy** à mão (Actions → Deploy → Run workflow). Ele sobe um banco vazio, com as migrations.
4. Restaure o último backup como na seção 4, a partir do passo 3. **Não** rode o seed antes: os usuários vêm do backup.
