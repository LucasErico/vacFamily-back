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

## Possibilidades futuras

As funcionalidades abaixo foram identificadas como evoluções desejáveis para versões pós-MVP, mas estão **fora do escopo do TCC** por exigirem credenciamentos, certificações ou integrações institucionais que inviabilizam sua implementação no contexto acadêmico atual.

### Integração com RNDS / HL7 FHIR

A **Rede Nacional de Dados em Saúde (RNDS)** do Ministério da Saúde expõe uma API baseada no padrão internacional **HL7 FHIR R4**, que permitiria ao vacFamily consultar e registrar doses diretamente no prontuário eletrônico nacional do cidadão. A integração exige certificado digital ICP-Brasil e-CNPJ e credenciamento formal junto ao DATASUS, sendo inviável no contexto acadêmico do TCC.

### Importação automática via CadSUS

O **CadSUS** (Cadastro Nacional de Usuários do SUS) centraliza o histórico de vacinações registradas em postos públicos de saúde. Uma integração futura poderia importar automaticamente esse histórico ao vincular o CPF do usuário, eliminando o preenchimento manual de doses já aplicadas. Depende de credenciamento no DATASUS e convênio com a SCTIE/MS.

### Autenticação via gov.br

O login federado via **gov.br** permitiria que o usuário acesse o vacFamily com a mesma identidade digital utilizada em serviços públicos federais, aumentando a confiança e eliminando o cadastro manual. A integração requer registro como Serviço Público Digital (SPD) junto à Secretaria de Governo Digital (SGD/MGI), processo aplicável apenas a serviços públicos ou parceiros credenciados.

### Notivisa / VigiMed — Registro de ESAVI

O **Notivisa** (ANVISA) e o **VigiMed** são os canais oficiais de farmacovigilância para registro de **Eventos Supostamente Atribuíveis à Vacinação ou Imunização (ESAVI)**. Uma versão futura poderia oferecer ao usuário a opção de relatar reações adversas diretamente a partir do registro de dose no aplicativo, com redirecionamento ou pré-preenchimento dos formulários oficiais.

### Biometria no acesso diário

Autenticação biométrica (impressão digital ou reconhecimento facial) para desbloquear o aplicativo sem reinserir senha, especialmente útil para uso frequente por cuidadores. Requer APIs nativas do sistema operacional, não disponíveis em PWA sem wrapper nativo (ex: Capacitor ou React Native).

### Push Notifications nativas

Envio de lembretes de vacinação via notificações push mesmo com o aplicativo fechado, utilizando serviços como **Firebase Cloud Messaging (FCM)**. No contexto atual, os lembretes funcionam apenas dentro do aplicativo. A implementação via Web Push API é tecnicamente possível em PWA, mas exige um servidor de push dedicado e gerenciamento de chaves VAPID, o que será avaliado em uma versão futura.

---

## Autores

- **Lucas Érico Quaresma Nunes**
- **Filipe Rodrigues Albuquerque**

Orientador: Prof. Alexandre Louzada  
Instituição: FAETERJ — Análise e Desenvolvimento de Sistemas
