# Workflow n8n — Relatório Fiscal Mensal

Este workflow recebe o payload do relatório fiscal do Nexus PDV e envia um e-mail
HTML formatado para a contabilidade do cliente.

## Fluxo

```
Webhook (POST /webhook/relatorio-fiscal-nexus)
   ↓
Code Node (monta HTML do e-mail com a lista de notas)
   ↓
Gmail (envia usando credencial OAuth do Google)
   ↓
Respond to Webhook (devolve OK ao PDV)
```

## Como importar

1. Abrir n8n: `http://177.153.62.21:5678/` (login com seu usuário admin).
2. **Workflows → Import from File** → escolher `relatorio-fiscal-n8n.json`.
3. Depois de importar, aparecerá 1 aviso: **credencial do Gmail não configurada**.

## Criar credencial do Gmail (uma vez)

O usuário decidiu usar Gmail com **Senha de App** (não OAuth2 tradicional):

1. Acessar https://myaccount.google.com/apppasswords logado como
   `reinonexusideal@gmail.com`.
2. Gerar uma nova "Senha de app" com nome "n8n Nexus" (16 caracteres).
3. No n8n: **Credentials → Add Credential → Gmail** → escolher a opção
   "**Google App Password**" (não OAuth2).
4. Preencher:
   - **User**: `reinonexusideal@gmail.com`
   - **Password**: (colar a senha de app de 16 caracteres, sem espaços)
5. Salvar.
6. Voltar no workflow, abrir o nó **Enviar e-mail (Gmail)** e selecionar a
   credencial recém-criada.

> **Se o n8n não mostrar a opção "App Password"** (versões mais novas só
> aceitam OAuth2 pro Gmail), use o node **Send Email (SMTP)** no lugar:
> - Host: `smtp.gmail.com`
> - Port: `465` (SSL) ou `587` (TLS)
> - User: `reinonexusideal@gmail.com`
> - Password: a senha de app

## Ativar o workflow

Após configurar a credencial, no canto superior direito do workflow, ligar o
toggle **Active**. O webhook começa a aceitar chamadas em:

```
http://177.153.62.21:5678/webhook/relatorio-fiscal-nexus
```

## Configurar no PDV do cliente

No PDV (Suporte → Fiscal), colar essa URL no campo **WEBHOOK DO N8N** e o e-mail
da contabilidade no campo **E-MAIL DA CONTABILIDADE**. Pronto — todo dia 5 do
mês (ou o dia configurado), o PDV dispara o envio automaticamente.

## Testar manualmente

Curl de teste (simula o payload que o PDV envia):

```bash
curl -X POST http://177.153.62.21:5678/webhook/relatorio-fiscal-nexus \
  -H "Content-Type: application/json" \
  -d '{
    "email_destino": "seuemail@gmail.com",
    "periodo": "2026-06",
    "quantidade": 2,
    "total": 45.90,
    "notas": [
      {"numero": 1, "serie": "1", "motor": "novo", "chave": "35260712345678000190650010000000011234567890", "valor_total": 22.90, "qr_code_url": "https://www.homologacao.nfce.fazenda.gov.br/consulta?chNFe=35260712345678000190650010000000011234567890", "created_at": "2026-06-10T14:30:00Z"},
      {"numero": 2, "serie": "1", "motor": "novo", "chave": "35260712345678000190650010000000021234567891", "valor_total": 23.00, "qr_code_url": "https://www.homologacao.nfce.fazenda.gov.br/consulta?chNFe=35260712345678000190650010000000021234567891", "created_at": "2026-06-15T18:20:00Z"}
    ]
  }'
```
