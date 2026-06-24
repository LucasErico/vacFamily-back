# vacFamily — Back-end

> API REST para acompanhamento vacinal e gestão familiar

[![Status](https://img.shields.io/badge/status-em%20desenvolvimento-yellow)](#)
[![TCC](https://img.shields.io/badge/TCC-FAETERJ%202026-blue)](#)
[![License](https://img.shields.io/badge/license-MIT-green)](#)

---

## Sobre o projeto

O **vacFamily** é um sistema de acompanhamento vacinal e gestão familiar desenvolvido como Trabalho de Conclusão de Curso na **FAETERJ — Análise e Desenvolvimento de Sistemas (2026)**.

Este repositório contém o **back-end** da aplicação: uma API REST responsável por toda a lógica de negócio, autenticação, validação de dados, comunicação com o banco de dados e processamento de sincronização offline.

> O front-end está em: [vacFamily-front](https://github.com/LucasErico/vacFamily-front)

---

## Funcionalidades da API

- Autenticação e autorização de usuários (JWT)
- CRUD de usuários
- CRUD de membros familiares
- CRUD de registros vacinais
- CRUD de lembretes
- Processamento da fila de operações offline (sincronização)
- Resolução de conflitos de sincronização
- Integrações externas futuras (IA, notificações)

---

## Stack tecnológica

| Tecnologia | Uso |
|---|---|
| **Node.js** | Runtime |
| **Fastify** | Framework web |
| **TypeScript** | Linguagem principal |
| **PostgreSQL** | Banco de dados relacional |
| **Supabase** | Plataforma de banco (free tier) |
| **Render** | Deploy (free tier) |

---

## Arquitetura

A API segue a regra arquitetural fundamental do projeto:

```
Front-end (PWA)  <-->  Back-end (API)  <-->  Banco de Dados
React + Vite          Node.js + Fastify      PostgreSQL (Supabase)
```

> O front-end **nunca** se comunica diretamente com o banco de dados.  
> Todo fluxo de informação respeita obrigatoriamente: `Front ↔ Back ↔ Banco`.

### Resolução de conflitos de sincronização

Estratégia híbrida: **versionamento por campo `version`** + **fila de operações (Operation Log)**.

| Situação | Comportamento da API |
|---|---|
| `version_capturada == version` no banco | Operação aplicada, `version` incrementado |
| `version_capturada != version` no banco | Conflito retornado ao front com ambas as versões |
| Usuário resolve o conflito | API aplica a escolha e incrementa `version` |

Todos os registros críticos possuem os campos: `created_at`, `updated_at`, `version`.

### Observação sobre o free tier do Render

O serviço entra em sleep após 15 minutos sem uso. A primeira requisição após o período de inatividade pode levar até ~1 minuto para responder. Comportamento esperado e aceitável no escopo acadêmico do projeto.

---

## Instalação e execução local

> Pré-requisitos: Node.js 18+ e npm ou yarn

```bash
# Clone o repositório
git clone https://github.com/LucasErico/vacFamily-back.git
cd vacFamily-back

# Instale as dependências
npm install

# Configure as variáveis de ambiente
cp .env.example .env
# Edite o .env com as credenciais do Supabase

# Inicie o servidor de desenvolvimento
npm run dev
```

---

## Variáveis de ambiente

```env
PORT=3000
SUPABASE_URL=https://xxxxxxxxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=seu_service_role_key
JWT_SECRET=seu_jwt_secret
```

---

## Entidades principais do banco

| Entidade | Descrição |
|---|---|
| `usuario` | Responsável pela conta |
| `membro_familiar` | Pessoa cujas vacinas são gerenciadas |
| `vacina` | Catálogo de vacinas |
| `registro_vacinal` | Histórico de doses aplicadas |
| `lembrete` | Alertas configurados pelo usuário |

> Modelagem detalhada do banco a ser adicionada na próxima etapa do projeto.

---

## Autores

- **Lucas Érico Quaresma Nunes**
- **Filipe Rodrigues Albuquerque**

Orientador: Prof. Alexandre Louzada  
Instituição: FAETERJ — Análise e Desenvolvimento de Sistemas
