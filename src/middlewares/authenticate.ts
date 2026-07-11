import { FastifyRequest, FastifyReply } from 'fastify'
import { createClient } from '@supabase/supabase-js'

/**
 * Middleware de autenticacao.
 * Valida o Bearer token JWT emitido pelo Supabase Auth.
 * Injeta o usuario autenticado em request.user
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({
      status: 'error',
      message: 'Token de autenticacao ausente ou invalido',
    })
  }

  const token = authHeader.replace('Bearer ', '')

  // Cria cliente Supabase com o token do usuario para validar
  const supabaseUrl = process.env.SUPABASE_URL!
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!

  const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: { user }, error } = await supabaseUser.auth.getUser()

  if (error || !user) {
    return reply.status(401).send({
      status: 'error',
      message: 'Token invalido ou expirado',
    })
  }

  // Injeta usuario na request para uso nas rotas
  ;(request as FastifyRequest & { user: typeof user }).user = user
}
