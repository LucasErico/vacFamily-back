# Setup de Variáveis de Ambiente — VacFamily Back

## Projeto Supabase

| Variável | Onde encontrar | Uso |
|---|---|---|
| `SUPABASE_URL` | Settings → API | Back + Front |
| `SUPABASE_ANON_KEY` | Settings → API Keys → Publishable | Front (VITE_SUPABASE_ANON_KEY) |
| `SUPABASE_SERVICE_ROLE_KEY` | Settings → API Keys → Secret | **Só back-end** |
| `SUPABASE_JWKS_URL` | `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` | Back |
| `JWT_SECRET` | Settings → JWT Keys | Back |

## Projeto Supabase — vacFamily (LucasErico's Org)

- **Project URL:** `https://kffcdtmgylzfllqhsikq.supabase.co`
- **JWKS URL:** `https://kffcdtmgylzfllqhsikq.supabase.co/auth/v1/.well-known/jwks.json`
- **Ambiente:** `main` (PRODUCTION)
- **Org:** LucasErico's Org (FREE)

> ⚠️ Os valores reais das chaves ficam **apenas no arquivo `.env` local** e nas **variáveis de ambiente do Render**.
> Nunca commitar `.env` — está no `.gitignore`.

## Variáveis no Render (Deploy)

Ao configurar o serviço no Render, adicionar em **Environment → Environment Variables**:

```
NODE_ENV=production
PORT=3000
FRONT_URL=https://vac-family.vercel.app
SUPABASE_URL=https://kffcdtmgylzfllqhsikq.supabase.co
SUPABASE_ANON_KEY=<publishable key>
SUPABASE_SERVICE_ROLE_KEY=<secret key>
SUPABASE_JWKS_URL=https://kffcdtmgylzfllqhsikq.supabase.co/auth/v1/.well-known/jwks.json
JWT_SECRET=<jwt secret do supabase>
JWT_EXPIRES_IN=7d
BCRYPT_SALT_ROUNDS=10
```

## Variáveis no Vercel (Front-end)

```
VITE_SUPABASE_URL=https://kffcdtmgylzfllqhsikq.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
VITE_API_URL=https://<seu-servico>.onrender.com
```
