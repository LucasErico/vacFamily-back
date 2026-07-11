import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { supabase } from './lib/supabase'

async function bootstrap() {
  const app = Fastify({ logger: true })

  // ── Plugins de segurança ─────────────────────────────────
  await app.register(helmet)

  await app.register(cors, {
    origin: process.env.FRONT_URL ?? 'http://localhost:5173',
    credentials: true,
  })

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  // ── Health check ───────────────────────────────────────
  app.get('/health', async () => ({
    status: 'ok',
    project: 'vacFamily-back',
    timestamp: new Date().toISOString(),
  }))

  // ── Health check banco (rpc now()) ────────────────────
  app.get('/health/db', async (_, reply) => {
    try {
      // Chama a função now() do PostgreSQL via RPC — mínimo privilégio necessário
      const { data, error } = await supabase.rpc('now')

      if (error) {
        return reply.status(500).send({
          status: 'error',
          detail: error,
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
        db_time: data,
        supabase_url: process.env.SUPABASE_URL,
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

  // ── Start ───────────────────────────────────────────
  const PORT = Number(process.env.PORT ?? 3000)
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`\nvacFamily-back rodando na porta ${PORT} \u2714`)
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})
