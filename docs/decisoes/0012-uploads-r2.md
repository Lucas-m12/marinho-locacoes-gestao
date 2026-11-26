# 0012 · Uploads no Cloudflare R2 com URL pré-assinada

- Status: Aceita
- Data: 01/11/2026

## Contexto

Fotos dos checklists, das unidades e dos danos, vídeo do teste e documentos de clientes. Muitas vezes enviados do celular no 4G.

## Decisão

- Storage: **Cloudflare R2**, bucket privado.
- Fluxo: `uploads.requestUpload` devolve a URL pré-assinada de `PUT` (assinada com `aws4fetch`); o front envia direto para o R2; `uploads.completeUpload` confere o objeto com `HEAD` (tamanho e tipo) e marca o upload como `COMPLETED`.
- Tabela `Upload` com status `PENDING` ou `COMPLETED`. Uploads nunca confirmados são apagados depois de 24 h por uma tarefa agendada.
- Leitura por URL pré-assinada de curta duração (5 a 15 min), via `files.getDownloadUrl`.
- O bucket tem CORS liberando o `PUT` a partir de `sistema.marinholocacoes.com`.
- O front reduz as fotos antes de enviar (lado maior até 2000 px, JPEG 0,85). Limites: imagem até 10 MB, vídeo até 50 MB e 30 s, documento até 10 MB.
- Chave do objeto: `<finalidade>/<aaaa>/<mm>/<uuid>.<ext>`.

## Consequências

- O servidor nunca recebe os bytes dos arquivos.
