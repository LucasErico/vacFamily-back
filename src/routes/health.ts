import { FastifyInstance } from 'fastify'

/**
 * GET /health
 * Rota pública de liveness — usada pelo front para acordar o back
 * no Render free tier (hiberna após 15 min de inatividade).
 * Não requer autenticação.
 */
export async function healthRoutes(app: FastifyInstance) {
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({ ok: true, timestamp: new Date().toISOString() })
  })
}
