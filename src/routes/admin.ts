/**
 * Rotas do painel administrativo.
 *
 * GET    /admin/overview        — KPIs gerais
 * GET    /admin/usuarios        — lista usuários via tabela `usuario`
 * DELETE /admin/usuarios/:id    — remove usuário
 *
 * IMPORTANTE: supabase.auth.admin.listUsers() lança exceção não-serialízavel
 * no free tier do Render/Supabase. Usamos a tabela `usuario` (pública) em vez disso.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../lib/supabase'
import { authenticate } from '../middlewares/authenticate'

export async function adminRoutes(app: FastifyInstance) {

  /** GET /admin/overview */
  app.get('/overview', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    try {
      const [usuarios, cardsAtivos, cardsTotais, vacinas, registros] = await Promise.all([
        supabase.from('usuario').select('*', { count: 'exact', head: true }),
        supabase.from('conteudo').select('*', { count: 'exact', head: true }).eq('ativo', true),
        supabase.from('conteudo').select('*', { count: 'exact', head: true }),
        supabase.from('vacina').select('*', { count: 'exact', head: true }),
        supabase.from('registro_vacina').select('*', { count: 'exact', head: true }),
      ])

      return {
        status: 'ok',
        overview: {
          totalUsuarios:  usuarios.count   ?? 0,
          cardsAtivos:    cardsAtivos.count ?? 0,
          cardsTotais:    cardsTotais.count ?? 0,
          totalVacinas:   vacinas.count     ?? 0,
          totalRegistros: registros.count   ?? 0,
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
      // 1. Busca usuários da tabela pública `usuario`
      const { data: usuarios, error: usuariosError } = await supabase
        .from('usuario')
        .select('*')
        .order('criado_em', { ascending: false })

      if (usuariosError) {
        request.log.error({ usuariosError }, 'usuario query error')
        return reply.status(500).send({ status: 'error', message: usuariosError.message })
      }

      const ids = (usuarios ?? []).map((u: Record<string, unknown>) => u.id as string)

      // 2. Contagem de membros por usuário
      const { data: membros } = await supabase
        .from('membro')
        .select('usuario_id')
        .in('usuario_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'])

      const contagemMembros: Record<string, number> = {}
      membros?.forEach((m: Record<string, unknown>) => {
        const uid = m.usuario_id as string
        contagemMembros[uid] = (contagemMembros[uid] ?? 0) + 1
      })

      // 3. IDs de admins
      const { data: adminRows } = await supabase
        .from('admin_users')
        .select('user_id')

      const adminIds = new Set(adminRows?.map((a: Record<string, unknown>) => a.user_id as string) ?? [])

      const resultado = (usuarios ?? []).map((u: Record<string, unknown>) => ({
        id:       u.id       as string,
        email:    (u.email   as string | null) ?? '',
        nome:     (u.nome    as string | null) ?? '',
        membros:  contagemMembros[u.id as string] ?? 0,
        criadoEm: u.criado_em as string,
        admin:    adminIds.has(u.id as string),
      }))

      return { status: 'ok', usuarios: resultado }
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
      return reply.status(400).send({
        status: 'error',
        message: 'Você não pode remover a própria conta.',
      })
    }

    try {
      // Tenta remoção via Auth Admin API
      const { error: authError } = await supabase.auth.admin.deleteUser(id)
      if (authError) {
        // Fallback: remove da tabela usuario (perde acesso mas não apaga do Auth)
        request.log.error({ authError }, 'deleteUser auth error — usando fallback')
        const { error: tblError } = await supabase.from('usuario').delete().eq('id', id)
        if (tblError) {
          return reply.status(500).send({ status: 'error', message: tblError.message })
        }
      }
      return reply.status(204).send()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      request.log.error({ err }, 'admin/delete-usuario error')
      return reply.status(500).send({ status: 'error', message: msg })
    }
  })
}

// ── Helper ───────────────────────────────────────────────────
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
  } catch (err) {
    request.log.error({ err }, 'isAdmin check error')
    reply.status(500).send({ status: 'error', message: 'Erro ao verificar permissão de admin' })
    return false
  }
}
