/**
 * Rotas do painel administrativo.
 *
 * GET    /admin/overview        — KPIs gerais
 * GET    /admin/usuarios        — lista usuários via tabela `usuario`
 * GET    /admin/schema-debug    — inspeciona colunas reais (remover em prod)
 * DELETE /admin/usuarios/:id    — remove usuário
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../lib/supabase'
import { authenticate } from '../middlewares/authenticate'

export async function adminRoutes(app: FastifyInstance) {

  /**
   * GET /admin/schema-debug
   * Retorna uma linha de cada tabela relevante para inspecionar nomes de colunas.
   * REMOVER após diagnosticar.
   */
  app.get('/schema-debug', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const [u, m, a] = await Promise.all([
      supabase.from('usuario').select('*').limit(1),
      supabase.from('membro_familiar').select('*').limit(1),
      supabase.from('admin_users').select('*').limit(1),
    ])

    return {
      status: 'ok',
      schemas: {
        usuario:         { columns: u.data?.[0] ? Object.keys(u.data[0]) : [], sample: u.data?.[0] ?? null, error: u.error?.message },
        membro_familiar: { columns: m.data?.[0] ? Object.keys(m.data[0]) : [], sample: m.data?.[0] ?? null, error: m.error?.message },
        admin_users:     { columns: a.data?.[0] ? Object.keys(a.data[0]) : [], sample: a.data?.[0] ?? null, error: a.error?.message },
      },
    }
  })

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
      // Busca todos os campos — usamos created_at (padrão Supabase)
      const { data: usuarios, error: usuariosError } = await supabase
        .from('usuario')
        .select('*')
        .order('created_at', { ascending: false })

      if (usuariosError) {
        request.log.error({ usuariosError }, 'usuario query error')
        return reply.status(500).send({ status: 'error', message: usuariosError.message })
      }

      const rows = usuarios ?? []
      const ids = rows.map((u: Record<string, unknown>) => u.id as string)

      // Contagem de membros por usuário
      const { data: membros } = await supabase
        .from('membro_familiar')
        .select('usuario_id')
        .in('usuario_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'])

      const contagemMembros: Record<string, number> = {}
      membros?.forEach((m: Record<string, unknown>) => {
        const uid = m.usuario_id as string
        contagemMembros[uid] = (contagemMembros[uid] ?? 0) + 1
      })

      // IDs de admins
      const { data: adminRows } = await supabase
        .from('admin_users')
        .select('user_id')

      const adminIds = new Set(adminRows?.map((a: Record<string, unknown>) => a.user_id as string) ?? [])

      // Monta resposta usando os campos que existem na linha real
      // (schema-debug mostra os nomes exatos)
      const resultado = rows.map((u: Record<string, unknown>) => ({
        id:       u.id                              as string,
        email:    (u.email    ?? '')                as string,
        nome:     (u.nome     ?? u.name ?? '')      as string,
        membros:  contagemMembros[u.id as string]   ?? 0,
        criadoEm: (u.created_at ?? u.criado_em ?? '') as string,
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
      const { error: authError } = await supabase.auth.admin.deleteUser(id)
      if (authError) {
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
