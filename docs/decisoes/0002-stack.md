# 0002 · Stack do sistema

- Status: Aceita
- Data: 01/11/2026

## Contexto

Monorepo criado com Better-T-Stack em 01/11/2026.

## Decisão

- Front: React 19 + Vite + TanStack Router (SPA, sem SSR) + TanStack Query + TanStack Form + Tailwind v4 + shadcn/ui (Base UI), publicado na Cloudflare.
- Servidor: Hono no Bun, com oRPC. Hono e não Elysia, porque com oRPC o framework só monta os handlers, e o Hono roda igual em Bun, Node, Workers e containers.
- Banco: PostgreSQL com Prisma.
- Autenticação: Better Auth (ADR 0011).
- Ferramentas: Turborepo, Biome, varlock para variáveis de ambiente.
- Sem PWA, sem modo offline e sem modo escuro por enquanto.

## Consequências

- Sistema web responsivo: celular primeiro, tablet e desktop.
