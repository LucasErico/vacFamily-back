/**
 * Rotas do painel administrativo.
 *
 * GET    /admin/overview        — KPIs gerais
 * GET    /admin/usuarios        — lista todos os usuários (via tabela perfil)
 * DELETE /admin/usuarios/:id    — remove usuário
 *
 * NOTA: supabase.auth.admin.listUsers() é instável no free tier do Supabase
 * (lança exceção não-serialízavel {}). Usamos a tabela `perfil` em vez disso.
 * Para o total de usuários no overview, contamos linhas da própria tabela `perfil`.
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../lib/supabase'
import { authenticate } from '../middlewares/authenticate'

export async function adminRoutes(app: FastifyInstance) {

  /** GET /admin/overview */
  app.get('/overview', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    try {
      const [perfis, cardsAtivos, cardsTotais, vacinas, registros] = await Promise.all([
        supabase.from('perfil').select('*', { count: 'exact', head: true }),
        supabase.from('conteudo').select('*', { count: 'exact', head: true }).eq('ativo', true),
        supabase.from('conteudo').select('*', { count: 'exact', head: true }),
        supabase.from('vacina').select('*', { count: 'exact', head: true }),
        supabase.from('registro_vacina').select('*', { count: 'exact', head: true }),
      ])

      return {
        status: 'ok',
        overview: {
          totalUsuarios:  perfis.count      ?? 0,
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

  /**
   * GET /admin/usuarios
   * Lê os usuários da tabela `perfil` (acessível via service_role sem problemas).
   * Enriquece com contagem de membros e flag de admin.
   */
  app.get('/usuarios', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    try {
      // 1. Busca perfis — tabela pública, service_role acessa sem restrição
      const { data: perfis, error: perfisError } = await supabase
        .from('perfil')
        .select('id, email, nome, criado_em')
        .order('criado_em', { ascending: false })

      if (perfisError) {
        request.log.error({ perfisError }, 'perfil query error')
        return reply.status(500).send({ status: 'error', message: perfisError.message })
      }

      const ids = (perfis ?? []).map(p => p.id)

      // 2. Contagem de membros por usuário
      const { data: membros } = await supabase
        .from('membro')
        .select('usuario_id')
        .in('usuario_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000'])

      const contagemMembros: Record<string, number> = {}
      membros?.forEach(m => {
        contagemMembros[m.usuario_id] = (contagemMembros[m.usuario_id] ?? 0) + 1
      })

      // 3. IDs de admins
      const { data: adminRows } = await supabase
        .from('admin_users')
        .select('user_id')

      const adminIds = new Set(adminRows?.map(a => a.user_id) ?? [])

      const usuarios = (perfis ?? []).map(p => ({
        id:       p.id,
        email:    p.email   ?? '',
        nome:     p.nome    ?? '',
        membros:  contagemMembros[p.id] ?? 0,
        criadoEm: p.criado_em,
        admin:    adminIds.has(p.id),
      }))

      return { status: 'ok', usuarios }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      request.log.error({ err }, 'admin/usuarios error')
      return reply.status(500).send({ status: 'error', message: msg })
    }
  })

  /**
   * DELETE /admin/usuarios/:id
   * Remove o usuário via auth.admin.deleteUser.
   * Se falhar (free tier), tenta soft-delete limpando a tabela perfil.
   */
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
      const { error } = await supabase.auth.admin.deleteUser(id)
      if (error) {
        request.log.error({ error }, 'deleteUser auth error')
        // Fallback: remove apenas da tabela perfil (o usuário perde acesso mas não é apagado do Auth)
        const { error: perfilError } = await supabase
          .from('perfil')
          .delete()
          .eq('id', id)
        if (perfilError) {
          return reply.status(500).send({ status: 'error', message: perfilError.message })
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
  } catch (err) {
    request.log.error({ err }, 'isAdmin check error')
    reply.status(500).send({ status: 'error', message: 'Erro ao verificar permissão de admin' })
    return false
  }
}
