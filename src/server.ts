import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { supabase } from './lib/supabase'
import { authRoutes } from './routes/auth'
import { membrosRoutes } from './routes/membros'
import { vacinasRoutes } from './routes/vacinas'
import { registrosRoutes } from './routes/registros'
import { lembretesRoutes } from './routes/lembretes'
import { conteudoRoutes } from './routes/conteudo'
import { adminRoutes } from './routes/admin'

async function bootstrap() {
  const app = Fastify({ logger: true })

  await app.register(helmet)

  const rawOrigins = process.env.FRONT_URL ?? 'http://localhost:5173'
  const allowedOrigins = rawOrigins.split(',').map(o => o.trim()).filter(Boolean)

  await app.register(cors, {
    origin: (origin, cb) => {
      if (!origin) return cb(null, true)
      if (allowedOrigins.some(o => origin === o || origin.endsWith('.vercel.app'))) {
        return cb(null, true)
      }
      return cb(new Error(`CORS: origem não permitida → ${origin}`), false)
    },
    credentials: true,
  })

  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' })

  app.get('/health', async () => ({
    status: 'ok',
    project: 'vacFamily-back',
    timestamp: new Date().toISOString(),
  }))

  app.get('/health/db', async (_, reply) => {
    try {
      const { data, error } = await supabase
        .from('vacina')
        .select('id, nome')
        .limit(3)

      if (error) {
        const tableNotFound = error.code === '42P01'
        return reply.status(tableNotFound ? 200 : 500).send({
          status: tableNotFound ? 'ok' : 'error',
          database: 'connected',
          warning: tableNotFound ? 'Tabela "vacina" ainda nao existe — rode as migrations' : undefined,
          error: tableNotFound ? undefined : error.message,
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
      return reply.status(500).send({ status: 'error', message, timestamp: new Date().toISOString() })
    }
  })

  await app.register(authRoutes,      { prefix: '/auth' })
  await app.register(membrosRoutes,   { prefix: '/membros' })
  await app.register(vacinasRoutes,   { prefix: '/vacinas' })
  await app.register(registrosRoutes, { prefix: '/registros' })
  await app.register(lembretesRoutes, { prefix: '/lembretes' })
  await app.register(conteudoRoutes,  { prefix: '/conteudo' })
  await app.register(adminRoutes,     { prefix: '/admin' })

  const PORT = Number(process.env.PORT ?? 3000)
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`\nvacFamily-back rodando na porta ${PORT} ✔`)
}

bootstrap().catch((err) => {
  console.error(err)
  process.exit(1)
})
