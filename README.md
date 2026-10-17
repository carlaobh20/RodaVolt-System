# PrimeCharge OS

Sistema de gestão (ERP) para empresas de locação de veículos elétricos.

**Edição local do RodaVolt:** veja [`docs/DESENVOLVIMENTO-LOCAL.md`](docs/DESENVOLVIMENTO-LOCAL.md)
para pasta no Mac, GitHub, branches, variáveis de ambiente, validações e deploy.
Use Node 22 (`.nvmrc`), `npm ci` e `npm run check` antes de publicar alterações.

## Status atual (2026-08-14)

> Este resumo fica desatualizado rápido — a referência viva de "onde paramos exatamente" (commit
> exato, o que está pendente de aplicar, o que está em investigação, o que está congelado) é o
> **[`CLAUDE.md`](CLAUDE.md)**. Leia ele antes de continuar qualquer trabalho nesta branch.

Repositório com só duas branches: `dev` (trabalho) e `main` (produção) — as demais foram
consolidadas em `main` e apagadas em 2026-08-14. Módulos entregues até aqui (histórico, não exaustivo):
Fundação (auth/tenancy/auditoria), Veículos com Cockpit do Ativo e Vehicle Intelligence, Command
Center (Home com 6 Engines de decisão), Cockpit do Motorista com Driver Intelligence e CRM
(Kanban), Contratos, Controladoria, Épico 8 (Vistoria), Épico 9 (Motor de Expansão da Frota —
**parcialmente congelado, ver CLAUDE.md**), Épico 10 (Inteligência de Renovação), Épico 11
(fundação do App do Motorista), Épico 12 (Lojinha/Estoque). Trabalho mais recente: Épico 3 —
Central de Decisão Empresarial (`src/features/estrategia/`), Fases 4.1 a 4.3 (centralização de
fórmulas financeiras no motor + remoção de toda classificação subjetiva de risco da tela).

- [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) — arquitetura, modelagem de domínio, mapa de telas e roadmap completo.
- [`FOUNDATION_PRINCIPLES.md`](FOUNDATION_PRINCIPLES.md), [`CORE_CONCEPTS.md`](CORE_CONCEPTS.md), [`DECISION_LOG.md`](DECISION_LOG.md), [`PRODUCT_VISION.md`](PRODUCT_VISION.md), [`NORTH_STAR.md`](NORTH_STAR.md), [`VALUE_ENGINE.md`](VALUE_ENGINE.md) — documentos de fundação da plataforma.

## Stack

React + TypeScript + Vite (SPA) · Supabase (Postgres, Auth, Storage, Edge Functions) · TailwindCSS + shadcn/ui · React Router · TanStack Query · React Hook Form + Zod · Deploy via Vercel.

## Rodando localmente

```
npm install
cp .env.example .env.local   # preencha com a URL e a publishable key do Supabase
npm run dev
```

## Estrutura de pastas

Modelo feature-based — detalhes completos em `docs/ARQUITETURA.md`, seção 1.2.
