# vacFamily — Back-end

> API REST para acompanhamento vacinal e gestão familiar

[![Status](https://img.shields.io/badge/status-funcional-brightgreen)](#)
[![TCC](https://img.shields.io/badge/TCC-FAETERJ%202026-blue)](#)
[![License](https://img.shields.io/badge/license-MIT-green)](#)

---

## Sobre o projeto

O **vacFamily** é um sistema de acompanhamento vacinal e gestão familiar desenvolvido como Trabalho de Conclusão de Curso na **FAETERJ — Análise e Desenvolvimento de Sistemas (2026)**.

Este repositório contém o **back-end** da aplicação: uma API REST responsável por toda a lógica de negócio, autenticação, validação de dados, comunicação com o banco de dados e processamento de sincronização offline.

> O front-end está em: [vacFamily-front](https://github.com/LucasErico/vacFamily-front)

**Deploy:** Render (free tier) — o servidor entra em sleep após 15 min de inatividade; a 1ª requisição pode levar até ~1 minuto (cold start). O front-end exibe um banner informativo durante esse período.

---

## Arquitetura geral

```
Front-end (PWA)  <-->  Back-end (API)  <-->  Banco de Dados
React + Vite          Node.js + Fastify      PostgreSQL (Supabase)
```

> O front-end **nunca** se comunica diretamente com o banco de dados.  
> Todo fluxo de informação respeita obrigatoriamente: `Front ↔ Back ↔ Banco`.

---

## Stack tecnológica

| Tecnologia | Uso |
|---|---|
| **Node.js 18+** | Runtime |
| **Fastify** | Framework web (alta performance, TypeScript nativo) |
| **TypeScript** | Linguagem principal |
| **Supabase Auth** | Autenticação (email/senha, JWT, confirmação de e-mail) |
| **PostgreSQL via Supabase** | Banco de dados relacional (free tier) |
| **bcrypt** | Hashing de senhas |
| **Render** | Deploy (free tier) |

---

## Autenticação e segurança

### Responsabilidades do back-end
- Recebe senha em texto plano do front-end (via HTTPS)
- Aplica **hashing com bcrypt** antes de qualquer persistência
- Emite **JWT** assinado para o front-end após login bem-sucedido
- Valida o JWT em todas as rotas protegidas via middleware
- Gerencia tokens de verificação de e-mail e de recuperação de senha
- Utiliza **Supabase Auth** como provedor de identidade

### Fluxo de criação de conta
1. Front envia `{ nome, email, senha }` para `POST /auth/register`
2. Back faz hash da senha com bcrypt
3. Back cria usuário no Supabase Auth
4. Supabase dispara e-mail com token de confirmação de 6 dígitos
5. Front redireciona para `/verificar-email`
6. Usuário insere o token → `POST /auth/verify-email`
7. Após confirmação, conta ativada e usuário redirecionado para login

> **Modo de teste (apenas desenvolvimento):** o front pode enviar `{ skipVerification: true }` no body de registro para que o back crie a conta já ativa sem aguardar confirmação por e-mail.

### Fluxo de recuperação de senha
1. Front envia `{ email }` para `POST /auth/forgot-password`
2. Back gera código aleatório de 6 dígitos, salva com TTL de 15 minutos no banco
3. Supabase/SMTP envia código por e-mail
4. Front exibe input de 6 dígitos + campo de nova senha
5. Front envia `{ email, codigo, novaSenha }` para `POST /auth/reset-password`
6. Back valida código, verifica TTL, aplica bcrypt na nova senha e atualiza

---

## Endpoints da API

### Autenticação (`/auth`)

| Método | Rota | Body | Resposta | Descrição |
|---|---|---|---|---|
| POST | `/auth/register` | `{ nome, email, senha, skipVerification? }` | `{ requiresVerification, userId }` | Cria conta |
| POST | `/auth/verify-email` | `{ userId, token }` | `{ ok }` | Confirma e-mail |
| POST | `/auth/resend-verification` | `{ email }` | `{ ok }` | Reenvia token |
| POST | `/auth/login` | `{ email, senha }` | `{ accessToken, user }` | Login |
| POST | `/auth/forgot-password` | `{ email }` | `{ ok }` | Envia código de recuperação |
| POST | `/auth/reset-password` | `{ email, codigo, novaSenha }` | `{ ok }` | Redefine senha |

### Membros familiares (`/membros`) — rotas protegidas por JWT

| Método | Rota | Descrição |
|---|---|---|
| GET | `/membros` | Lista membros do usuário autenticado |
| POST | `/membros` | Cria novo membro familiar |
| PUT | `/membros/:id` | Atualiza membro |
| DELETE | `/membros/:id` | Remove membro |

### Vacinas (`/vacinas`) — rotas protegidas por JWT

| Método | Rota | Descrição |
|---|---|---|
| GET | `/vacinas` | Retorna catálogo de vacinas (tabela `vacina`, seed) |
| GET | `/vacinas/regras` | Retorna regras de reforço por vacina |

### Registros vacinais (`/registros`) — rotas protegidas por JWT

| Método | Rota | Descrição |
|---|---|---|
| GET | `/registros?membroId=` | Histórico vacinal do membro |
| POST | `/registros` | Registra dose; gera lembrete de reforço automaticamente |
| PUT | `/registros/:id` | Atualiza registro vacinal |
| DELETE | `/registros/:id` | Remove registro |

### Lembretes (`/lembretes`) — rotas protegidas por JWT

| Método | Rota | Descrição |
|---|---|---|
| GET | `/lembretes` | Lista lembretes do usuário |
| POST | `/lembretes` | Cria lembrete manual |
| PUT | `/lembretes/:id` | Atualiza status (pendente / concluído / ignorado) |
| DELETE | `/lembretes/:id` | Remove lembrete |

### Sincronização offline (`/sync`) — rota protegida por JWT

| Método | Rota | Descrição |
|---|---|---|
| POST | `/sync` | Recebe fila de operações do IndexedDB e processa em ordem |

### Assistente IA (`/assistente`) — rota protegida por JWT

| Método | Rota | Descrição |
|---|---|---|
| POST | `/assistente/mensagem` | Recebe mensagem do usuário, injeta contexto vacinal, chama Groq/Gemini e retorna resposta |

> O back-end é o único que conhece a chave da API de IA. O histórico de conversa existe apenas na memória da sessão no MVP.

---

## Modelagem do banco de dados

O banco possui **7 tabelas** no PostgreSQL via Supabase:

### `usuario`
Espelho do `auth.users` do Supabase, criado automaticamente via trigger após confirmação de e-mail.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID (PK) | Espelha `auth.users.id` |
| `nome` | TEXT | Nome do responsável |
| `email` | TEXT | E-mail (unique) |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |

### `membro_familiar`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID (PK) | — |
| `usuario_id` | UUID (FK) | Responsável pela conta |
| `nome` | TEXT | Nome do membro |
| `data_nascimento` | DATE | — |
| `sexo` | TEXT | `M`, `F`, `outro` |
| `relacao` | TEXT | `filho`, `conjuge`, `pai`, etc. |
| `observacoes` | TEXT | Informações adicionais |
| `version` | INTEGER | Controle de conflito offline |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |

### `vacina`
Tabela de referência, populada via seed. Não aceita inserções livres pelo usuário.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID (PK) | — |
| `nome` | TEXT | Nome da vacina |
| `descricao` | TEXT | Breve descrição |
| `fabricante` | TEXT | Opcional |
| `doencas_previstas` | TEXT[] | Doenças que previne |
| `faixa_etaria` | TEXT[] | Ciclos de vida (`crianca`, `adulto`, `idoso`…) |

### `regra_reforco`
Define o esquema de doses e reforços para cada vacina.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID (PK) | — |
| `vacina_id` | UUID (FK) | — |
| `numero_dose` | INTEGER | Número da dose (1, 2, 3…) |
| `idade_minima_dias` | INTEGER | Idade mínima para aplicar (em dias) |
| `intervalo_anterior_dias` | INTEGER | Intervalo desde a dose anterior |
| `descricao` | TEXT | Ex: "Reforço anual" |

### `registro_vacinal`

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID (PK) | — |
| `membro_familiar_id` | UUID (FK) | — |
| `vacina_id` | UUID (FK) | — |
| `data_aplicacao` | DATE | — |
| `numero_dose` | INTEGER | Número da dose aplicada |
| `local_aplicacao` | TEXT | Posto/clínica |
| `observacoes` | TEXT | Usado também para vacinas avulsas |
| `version` | INTEGER | Controle de conflito offline |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |

### `lembrete`
Suporta campanhas gerais (`membro_familiar_id = NULL`) e reforços específicos.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID (PK) | — |
| `usuario_id` | UUID (FK) | — |
| `membro_familiar_id` | UUID (FK, nullable) | NULL = campanha geral |
| `vacina_id` | UUID (FK, nullable) | — |
| `data_prevista` | DATE | Data do próximo reforço |
| `titulo` | TEXT | Ex: "Reforço da Febre Amarela" |
| `descricao` | TEXT | — |
| `tipo` | TEXT | `reforco`, `campanha`, `manual` |
| `status` | TEXT | `pendente`, `concluido`, `ignorado` |
| `automatico` | BOOLEAN | Gerado pelo sistema ou pelo usuário |
| `numero_dose` | INTEGER | Número da dose do reforço |
| `version` | INTEGER | Controle de conflito offline |
| `created_at` | TIMESTAMPTZ | — |
| `updated_at` | TIMESTAMPTZ | — |

### `conteudo`
Artigos e notícias informativas sobre vacinação. Sem painel admin no MVP; populado via seed.

| Campo | Tipo | Descrição |
|---|---|---|
| `id` | UUID (PK) | — |
| `titulo` | TEXT | — |
| `corpo` | TEXT | Conteúdo em Markdown ou HTML |
| `categoria` | TEXT | Ex: `crianças`, `idosos`, `viagens` |
| `publicado_em` | DATE | — |

---

## Resolução de conflitos de sincronização

Estratégia híbrida: **versionamento por campo `version`** + **fila de operações (Operation Log)**.

| Situação | Comportamento da API |
|---|---|
| `version_capturada == version` no banco | Operação aplicada, `version` incrementado |
| `version_capturada != version` no banco | Conflito retornado ao front com ambas as versões |
| Usuário resolve o conflito | API aplica a escolha e incrementa `version` |

Todos os registros editáveis possuem os campos: `created_at`, `updated_at`, `version`.

---

## Instalação e execução local

> Pré-requisitos: Node.js 18+ e npm

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
GROQ_API_KEY=sua_chave_groq          # ou GEMINI_API_KEY
BCRYPT_SALT_ROUNDS=12
SMTP_HOST=smtp.exemplo.com           # para envio de e-mails de recuperação
SMTP_PORT=587
SMTP_USER=usuario@exemplo.com
SMTP_PASS=senha_smtp
```

---

## Possibilidades futuras (pós-TCC)

- **Integração com RNDS / HL7 FHIR** — requer certificado digital ICP-Brasil e credenciamento no DATASUS
- **Importação automática via CadSUS** — depende de convênio com SCTIE/MS
- **Autenticação via gov.br** — requer registro como Serviço Público Digital junto à SGD/MGI
- **Notivisa / VigiMed (ESAVI)** — registro de eventos adversos pós-vacinação
- **Push Notifications nativas** — Web Push API com servidor VAPID dedicado
- **Histórico de conversa com o Assistente IA** — tabela no banco com janela de contexto e TTL

---

## Autores

- **Lucas Érico Quaresma Nunes**
- **Filipe Rodrigues Albuquerque**

Orientador: Prof. Alexandre Louzada  
Instituição: FAETERJ — Análise e Desenvolvimento de Sistemas
