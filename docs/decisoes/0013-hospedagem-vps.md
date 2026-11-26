# 0013 · Hospedagem em VPS

- Status: Aceita
- Data: 01/11/2026

## Contexto

Lucas quer aprender a operar um servidor e poder subir outros projetos de teste.

## Decisão

- Servidor, Postgres e tarefas agendadas numa **VPS**, com Docker Compose (ou Coolify ou Dokploy).
- TLS com Caddy. Só as portas 80, 443 e SSH por chave abertas. Atualizações automáticas do sistema.
- Postgres em container com volume. Backup diário com `pg_dump` enviado para o R2, fora da máquina.
- Container de cron para: limpar uploads órfãos, backup, apagar documentos vencidos (ADR 0016).
- Front continua na Cloudflare. DNS da Cloudflare apontando `api.marinholocacoes.com` para a VPS.
- Migrations com `prisma migrate deploy` no deploy.

## Consequências

- Lucas passa a ser responsável por backup, atualização e segurança do Postgres. Restaurar um backup deve ser testado antes do lançamento.
