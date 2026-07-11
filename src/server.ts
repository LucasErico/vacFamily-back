import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { supabase } from './lib/supabase'

async function bootstrap() {
  const app = Fastify({ logger: true })

  await app.register(helmet)

  await app.register(cors, {
    origin: process.env.FRONT_URL ?? 'http://localhost:5173',
    credentials: true,
  })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  app.get('/health', async () => ({
    status: 'ok',
    project: 'vacFamily-back',
    timestamp: new Date().toISOString(),
  }))

  app.get('/health/db', async (_, reply) => {
    try {
      // Tenta listar vacinas (tabela pública do projeto)
      // Se a tabela ainda não existe, retorna erro específico mas confirma que a conexão funciona
      const { data, error, status } = await supabase
        .from('vacina')
        .select('id, nome')
        .limit(3)

      if (error) {
        // Código 42P01 = tabela não existe — conexão OK mas tabelas ainda não foram criadas
        const tableNotFound = error.code === '42P01'
        return reply.status(tableNotFound ? 200 : 500).send({
          status: tableNotFound ? 'ok' : 'error',
          database: 'connected',
          warning: tableNotFound ? 'Tabela "vacina" ainda não existe — rode as migrations no Supabase' : undefined,
          error: tableNotFound ? undefined : error.message,
          error_code: tableNotFound ? undefined : error.code,
          env_check: {
            supabase_url: process.env.SUPABASE_URL ? 'set' : 'MISSING',
            service_role_key: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'set' : 'MISSING',
          },
          timestamp: new Date().toISOString(),
        })
      }

      return {
        status: 'ok',
        database: 'connected',
        vacinas_encontradas: data?.length ?? 0,
        amostra: data,
        timestamp: new Date().toISOString(),
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err)
      return reply.status(500).send({
        status: 'error',
        message,
        timestamp: new Date().toISOString(),
      })
    }
  })

  // ── Rotas (registrar conforme desenvolvimento) ─────────────
  // await app.register(import('./routes/auth'), { prefix: '/auth' })
  // await app.register(import('./routes/membros'), { prefix: '/membros' })
  // await app.register(import('./routes/vacinas'), { prefix: '/vacinas' })
  // await app.register(import('./routes/registros'), { prefix: '/registros' })
  // await app.register(import('./routes/lembretes'), { prefix: '/lembretes' })
  // await app.register(import('./routes/sync'), { prefix: '/sync' })
  // await app.register(import('./routes/assistente'), { prefix: '/assistente' })

  const PORT = Number(process.env.PORT ?? 3000)
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`\nvacFamily-back rodando na porta ${PORT} \u2714`)
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})
