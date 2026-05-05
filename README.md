# Onicanal — Dashboard Multiempresa

Painel multiempresa que se conecta ao **Tiny (Olist)** e (em fases futuras) aos
marketplaces **Mercado Livre**, **Shopee** e **Amazon** para consolidar vendas,
produtos, margens, curva ABC e estoque das 3 empresas em um único lugar.

> **Status atual:** Fase 1 — Fundação. Infraestrutura, login, layout e cadastro
> de empresas/tokens prontos. A sincronização do Tiny vem na Fase 2.

## Visão geral da arquitetura

```
Navegador
   │
   ▼
Vercel (Next.js 14 App Router)
   │
   ├── Server Components / Server Actions
   │      └── Prisma → Postgres (Supabase)
   │
   └── Worker de sincronização (Fase 2)
          └── API Tiny v3 (Olist) — 1 token por empresa
```

- **Frontend:** Next.js 14 + Tailwind + shadcn/ui + Recharts
- **Backend:** Next.js API + Server Actions
- **Banco:** Postgres (recomendado: Supabase com pooler PgBouncer)
- **Auth:** NextAuth (Auth.js) v5, provider Credentials, sessão JWT
- **Segurança:** tokens Tiny criptografados em AES-256-GCM antes de gravar

## Roadmap

| Fase | Entrega                                                                |
| ---- | ---------------------------------------------------------------------- |
| 1    | Fundação: login, layout, cadastro de empresas, criptografia de tokens. |
| 2    | Conector Tiny v3, sync de produtos e pedidos.                          |
| 3    | Dashboards de vendas (séries temporais, comparativos).                 |
| 4    | Curva ABC e análise de margens.                                        |
| 5    | Estoque (giro, cobertura, ruptura, sugestão de compra).                |
| 6    | Deploy estável + documentação ao usuário final.                        |
| 7+   | Marketplaces: ML, Shopee, Amazon (ads, posição, taxas).                |

## Como subir o ambiente (passo a passo, do zero)

> ⚠️ Você não precisa instalar nada no seu computador para usar o sistema —
> tudo roda na nuvem. Os passos abaixo são para a configuração inicial e para
> quem for desenvolver localmente.

### 1. Crie as contas (todas com plano gratuito)

1. **GitHub** — onde fica o código.
2. **Vercel** (https://vercel.com) — hospeda o site. Faça login com GitHub.
3. **Supabase** (https://supabase.com) — banco de dados Postgres. Faça login
   com GitHub.

### 2. Crie o projeto no Supabase

1. Vá em **New Project** → escolha um nome (ex.: `onicanal`).
2. Anote a **senha do banco** que você definir.
3. Aguarde provisionar (~1 min).
4. No menu **Settings → Database → Connection string** copie:
   - **Connection pooling** (porta 6543) → use no `DATABASE_URL`
   - **Direct connection** (porta 5432) → use no `DIRECT_URL`

### 3. Conecte o repositório no Vercel

1. **Add New Project** → importe `otimizador-onicanal` do GitHub.
2. **Framework preset:** Next.js (detectado automaticamente).
3. Antes de fazer o deploy, vá em **Environment Variables** e cadastre:

| Variável         | Valor                                                       |
| ---------------- | ----------------------------------------------------------- |
| `DATABASE_URL`   | string do Supabase (porta **6543** com `?pgbouncer=true`)   |
| `DIRECT_URL`     | string do Supabase (porta **5432**)                         |
| `AUTH_SECRET`    | gere com `openssl rand -base64 32`                          |
| `NEXTAUTH_URL`   | URL do seu site no Vercel (ex.: `https://onicanal.vercel.app`) |
| `ENCRYPTION_KEY` | gere com `openssl rand -hex 32` (64 caracteres)             |
| `ADMIN_EMAIL`    | seu e-mail de login                                         |
| `ADMIN_PASSWORD` | sua senha (use 12+ caracteres; pode trocar depois)          |
| `ADMIN_NAME`     | seu nome                                                    |

4. Clique em **Deploy**.

### 4. (Tudo automático) Tabelas e usuário admin

Você **não precisa abrir terminal nenhum**. Durante o build do Vercel:

- O Prisma cria/atualiza as tabelas no Supabase automaticamente.
- No seu **primeiro login**, se você usar exatamente `ADMIN_EMAIL` e
  `ADMIN_PASSWORD` definidos no Vercel, o sistema cria seu usuário admin
  na hora.

### 5. Acesse o site

Abra a URL do seu projeto no Vercel, faça login com `ADMIN_EMAIL` /
`ADMIN_PASSWORD`, vá em **Empresas** e cadastre as 3 empresas com seus
respectivos tokens do Tiny.

> Onde encontrar o token Tiny: painel do Tiny → **Configurações →
> Integrações → API**.

## Desenvolvimento local

```bash
npm install
cp .env.example .env.local         # preencha as variáveis
npx prisma db push                 # sincroniza o schema com o Postgres
npm run seed                       # cria seu usuário inicial
npm run dev                        # http://localhost:3000
```

Comandos úteis:

```bash
npm run db:studio   # abre o Prisma Studio (UI para o banco)
npm run lint        # linter
npm run build       # build de produção
```

## Estrutura de pastas

```
src/
  app/
    layout.tsx                   # shell base
    page.tsx                     # redireciona para /dashboard
    login/page.tsx               # tela de login
    (dashboard)/                 # rotas autenticadas (mesmo layout)
      layout.tsx
      dashboard/page.tsx         # home
      empresas/page.tsx          # cadastro multiempresa
      vendas | produtos | abc | margens | estoque | configuracoes
    api/auth/[...nextauth]/      # handler do NextAuth
  components/
    ui/                          # shadcn/ui (botão, card, input, dialog, etc.)
    layout/                      # sidebar, header, logout
    empresas/                    # lista e dialog de empresa
  lib/
    auth.ts                      # NextAuth config (Credentials)
    db.ts                        # Prisma client singleton
    crypto.ts                    # AES-256-GCM p/ tokens Tiny
    utils.ts                     # cn, formatBRL, formatNumber, etc.
  server/
    empresas-actions.ts          # server actions (create/update/delete)
prisma/
  schema.prisma                  # schema multiempresa
  seed.ts                        # cria o usuário admin
legacy/
  server.js / public/            # versão antiga (Express + OpenAI)
```

## Segurança

- Senhas armazenadas com bcrypt (12 rounds).
- Tokens Tiny criptografados em AES-256-GCM com chave de 32 bytes; só são
  decifrados em memória, no exato momento de chamar a API.
- Rotas protegidas por middleware NextAuth — qualquer rota fora de `/login` e
  `/api/auth` exige sessão válida.

## Licença

Uso interno Onicanal.
