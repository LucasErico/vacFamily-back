/**
 * Rotas do painel administrativo.
 *
 * GET    /admin/overview        — KPIs gerais
 * GET    /admin/usuarios        — lista todos os usuários
 * DELETE /admin/usuarios/:id    — remove usuário
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../lib/supabase'
import { authenticate } from '../middlewares/authenticate'

export async function adminRoutes(app: FastifyInstance) {

  /** GET /admin/overview */
  app.get('/overview', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    try {
      const [cardsAtivos, cardsTotais, vacinas, registros] = await Promise.all([
        supabase.from('conteudo').select('*', { count: 'exact', head: true }).eq('ativo', true),
        supabase.from('conteudo').select('*', { count: 'exact', head: true }),
        supabase.from('vacina').select('*', { count: 'exact', head: true }),
        supabase.from('registro_vacina').select('*', { count: 'exact', head: true }),
      ])

      // listUsers com paginação — busca até 1000 usuários
      const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })
      if (authError) throw authError

      return {
        status: 'ok',
        overview: {
          totalUsuarios:  authData.users.length,
          cardsAtivos:    cardsAtivos.count  ?? 0,
          cardsTotais:    cardsTotais.count  ?? 0,
          totalVacinas:   vacinas.count      ?? 0,
          totalRegistros: registros.count    ?? 0,
        },
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      request.log.error({ err }, 'admin/overview error')
      return reply.status(500).send({ status: 'error', message: msg })
    }
  })

  /** GET /admin/usuarios */
  app.get('/usuarios', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    try {
      // Supabase Auth Admin: listUsers exige page + perPage explícitos
      const { data: authData, error: authError } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      })

      if (authError) {
        request.log.error({ authError }, 'listUsers error')
        return reply.status(500).send({ status: 'error', message: authError.message })
      }

      const ids = authData.users.map(u => u.id)

      // Contagem de membros por usuário
      const { data: membros, error: membrosError } = await supabase
        .from('membro')
        .select('usuario_id')
        .in('usuario_id', ids.length > 0 ? ids : ['_noop_'])

      if (membrosError) {
        request.log.error({ membrosError }, 'membro query error')
      }

      const contagemMembros: Record<string, number> = {}
      membros?.forEach(m => {
        contagemMembros[m.usuario_id] = (contagemMembros[m.usuario_id] ?? 0) + 1
      })

      // Admins
      const { data: adminRows, error: adminError } = await supabase
        .from('admin_users')
        .select('user_id')

      if (adminError) {
        request.log.error({ adminError }, 'admin_users query error')
      }

      const adminIds = new Set(adminRows?.map(a => a.user_id) ?? [])

      const usuarios = authData.users.map(u => ({
        id:       u.id,
        email:    u.email    ?? '',
        nome:     (u.user_metadata?.nome as string | undefined) ?? '',
        membros:  contagemMembros[u.id] ?? 0,
        criadoEm: u.created_at,
        admin:    adminIds.has(u.id),
      }))

      return { status: 'ok', usuarios }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      request.log.error({ err }, 'admin/usuarios error')
      return reply.status(500).send({ status: 'error', message: msg })
    }
  })

  /** DELETE /admin/usuarios/:id */
  app.delete('/usuarios/:id', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const { id } = request.params as { id: string }
    const caller = (request as FastifyRequest & { user?: { id?: string } }).user

    if (caller?.id === id) {
      return reply.status(400).send({ status: 'error', message: 'Você não pode remover a própria conta.' })
    }

    try {
      const { error } = await supabase.auth.admin.deleteUser(id)
      if (error) {
        request.log.error({ error }, 'deleteUser error')
        return reply.status(500).send({ status: 'error', message: error.message })
      }
      return reply.status(204).send()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      request.log.error({ err }, 'admin/delete-usuario error')
      return reply.status(500).send({ status: 'error', message: msg })
    }
  })
}

// ── Helper: verifica se o usuário autenticado é admin ──────────
async function isAdmin(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const user = (request as FastifyRequest & { user?: { id?: string } }).user
  if (!user?.id) {
    reply.status(401).send({ status: 'error', message: 'Usuário não autenticado' })
    return false
  }
  try {
    const { data } = await supabase
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()
    if (!data) {
      reply.status(403).send({ status: 'error', message: 'Acesso restrito a administradores' })
      return false
    }
    return true
  } catch {
    reply.status(500).send({ status: 'error', message: 'Erro ao verificar permissão de admin' })
    return false
  }
}
