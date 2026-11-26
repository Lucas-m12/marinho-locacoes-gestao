# 0005 · IDs e códigos de negócio

- Status: Aceita
- Data: 01/11/2026

## Contexto

As pessoas falam em códigos ("LOC-0029", "MAR-002"), e o banco precisa de chaves estáveis.

## Decisão

- Chave primária: UUID v7, no tipo `uuid` nativo do Postgres.
- Códigos de negócio em campos próprios, únicos:
  - `LOC-0001`: sequência única, sem separar por ano.
  - `OS-001`: ordens de serviço.
  - `MAR-001`: unidades, vindos da etiqueta física.
- Os códigos sequenciais saem de uma tabela de contadores, travada dentro da transação que cria o registro.

## Consequências

- Códigos nunca são reutilizados. Um equipamento aposentado mantém o seu.
