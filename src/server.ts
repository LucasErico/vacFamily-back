import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'

const app = Fastify({
  logger: true,
})

// ── Plugins de segurança ──────────────────────────────────────
await app.register(helmet)

await app.register(cors, {
  origin: process.env.FRONT_URL ?? 'http://localhost:5173',
  credentials: true,
})

await app.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute',
})

// ── Health check ─────────────────────────────────────────────
app.get('/health', async () => ({
  status: 'ok',
  project: 'vacFamily-back',
  timestamp: new Date().toISOString(),
}))

// ── Rotas (serão registradas aqui conforme desenvolvimento) ───
// await app.register(import('./routes/auth'), { prefix: '/auth' })
// await app.register(import('./routes/membros'), { prefix: '/membros' })
// await app.register(import('./routes/vacinas'), { prefix: '/vacinas' })
// await app.register(import('./routes/registros'), { prefix: '/registros' })
// await app.register(import('./routes/lembretes'), { prefix: '/lembretes' })
// await app.register(import('./routes/sync'), { prefix: '/sync' })
// await app.register(import('./routes/assistente'), { prefix: '/assistente' })

// ── Start ─────────────────────────────────────────────────────
const PORT = Number(process.env.PORT ?? 3000)

try {
  await app.listen({ port: PORT, host: '0.0.0.0' })
  console.log(`vacFamily-back rodando na porta ${PORT}`)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
