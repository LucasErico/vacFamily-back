/**
 * Rotas do painel administrativo.
 *
 * GET  /admin/overview        — KPIs gerais (usuários, cards, vacinas, registros)
 * GET  /admin/usuarios        — lista todos os usuários cadastrados
 * DELETE /admin/usuarios/:id  — remove usuário do Supabase Auth
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../lib/supabase'
import { authenticate } from '../middlewares/authenticate'

export async function adminRoutes(app: FastifyInstance) {

  /**
   * GET /admin/overview
   * Retorna KPIs: total de usuários, cards ativos, vacinas cadastradas, registros de vacinação.
   */
  app.get('/overview', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const [usuarios, cardsAtivos, cardsTotais, vacinas, registros] = await Promise.all([
      supabase.auth.admin.listUsers(),
      supabase.from('conteudo').select('*', { count: 'exact', head: true }).eq('ativo', true),
      supabase.from('conteudo').select('*', { count: 'exact', head: true }),
      supabase.from('vacina').select('*', { count: 'exact', head: true }),
      supabase.from('registro_vacina').select('*', { count: 'exact', head: true }),
    ])

    return {
      status: 'ok',
      overview: {
        totalUsuarios:  usuarios.data?.users?.length ?? 0,
        cardsAtivos:    cardsAtivos.count ?? 0,
        cardsTotais:    cardsTotais.count ?? 0,
        totalVacinas:   vacinas.count ?? 0,
        totalRegistros: registros.count ?? 0,
      },
    }
  })

  /**
   * GET /admin/usuarios
   * Lista todos os usuários cadastrados via Supabase Auth admin.
   */
  app.get('/usuarios', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const { data, error } = await supabase.auth.admin.listUsers()
    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    // Para cada usuário, busca a contagem de membros na tabela membro
    const ids = data.users.map(u => u.id)
    const { data: membros } = await supabase
      .from('membro')
      .select('usuario_id')
      .in('usuario_id', ids)

    const contagemMembros: Record<string, number> = {}
    membros?.forEach(m => {
      contagemMembros[m.usuario_id] = (contagemMembros[m.usuario_id] ?? 0) + 1
    })

    const usuarios = data.users.map(u => ({
      id:         u.id,
      email:      u.email ?? '',
      nome:       u.user_metadata?.nome ?? '',
      membros:    contagemMembros[u.id] ?? 0,
      criadoEm:   u.created_at,
      admin:      false, // será enriquecido abaixo
    }))

    // Marca admins
    const { data: admins } = await supabase.from('admin_users').select('user_id')
    const adminIds = new Set(admins?.map(a => a.user_id) ?? [])
    usuarios.forEach(u => { u.admin = adminIds.has(u.id) })

    return { status: 'ok', usuarios }
  })

  /**
   * DELETE /admin/usuarios/:id
   * Remove o usuário do Supabase Auth (e em cascata da tabela admin_users).
   */
  app.delete('/usuarios/:id', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const { id } = request.params as { id: string }
    const caller = (request as FastifyRequest & { user?: { id?: string } }).user

    if (caller?.id === id) {
      return reply.status(400).send({ status: 'error', message: 'Você não pode remover a própria conta.' })
    }

    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return reply.status(204).send()
  })
}

// ── Helper: verifica se o usuário autenticado é admin ──────────
async function isAdmin(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const user = (request as FastifyRequest & { user?: { id?: string } }).user
  if (!user?.id) {
    reply.status(401).send({ status: 'error', message: 'Usuário não autenticado' })
    return false
  }
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
}
