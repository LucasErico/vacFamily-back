import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../lib/supabase'
import { authenticate } from '../middlewares/authenticate'

/**
 * Rotas de conteúdo (cards do carrossel do Dashboard).
 *
 * GET    /conteudo        — público: cards ativos (Dashboard)
 * GET    /conteudo/admin  — admin:   todos os cards
 * POST   /conteudo        — admin:   cria card
 * PUT    /conteudo/:id    — admin:   atualiza card
 * DELETE /conteudo/:id    — admin:   remove card
 *
 * Permissão de admin verificada via tabela `admin_users` (user_id uuid).
 * Crie a tabela e insira seu UUID antes de usar as rotas protegidas:
 *
 *   create table admin_users (
 *     user_id uuid primary key references auth.users(id) on delete cascade
 *   );
 *   insert into admin_users (user_id) values ('<seu-uuid-aqui>');
 */
export async function conteudoRoutes(app: FastifyInstance) {

  // ── Público: cards ativos para o Dashboard ───────────────
  app.get('/', async (_request, reply) => {
    const { data, error } = await supabase
      .from('conteudo')
      .select('*')
      .eq('ativo', true)
      .order('ordem', { ascending: true })

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }
    return { status: 'ok', cards: data }
  })

  // ── Admin: todos os cards ──────────────────────────────
  app.get('/admin', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const { data, error } = await supabase
      .from('conteudo')
      .select('*')
      .order('ordem', { ascending: true })

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }
    return { status: 'ok', cards: data }
  })

  // ── Criar card ──────────────────────────────────────────
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const body = request.body as {
      titulo: string
      descricao: string
      cor: string
      icone: string
      ativo?: boolean
      ordem?: number
    }

    if (!body.titulo?.trim() || !body.descricao?.trim() || !body.cor || !body.icone) {
      return reply.status(400).send({
        status: 'error',
        message: 'Campos obrigatórios: titulo, descricao, cor, icone',
      })
    }

    let ordem = body.ordem
    if (ordem === undefined) {
      const { count } = await supabase
        .from('conteudo')
        .select('*', { count: 'exact', head: true })
      ordem = count ?? 0
    }

    const { data, error } = await supabase
      .from('conteudo')
      .insert({
        titulo:    body.titulo.trim(),
        descricao: body.descricao.trim(),
        cor:       body.cor,
        icone:     body.icone,
        ativo:     body.ativo ?? true,
        ordem,
      })
      .select()
      .single()

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }
    return reply.status(201).send({ status: 'ok', card: data })
  })

  // ── Atualizar card ─────────────────────────────────────
  app.put('/:id', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const { id } = request.params as { id: string }
    const body = request.body as Partial<{
      titulo: string
      descricao: string
      cor: string
      icone: string
      ativo: boolean
      ordem: number
    }>

    const updates: Record<string, unknown> = {}
    if (body.titulo    !== undefined) updates.titulo    = body.titulo.trim()
    if (body.descricao !== undefined) updates.descricao = body.descricao.trim()
    if (body.cor       !== undefined) updates.cor       = body.cor
    if (body.icone     !== undefined) updates.icone     = body.icone
    if (body.ativo     !== undefined) updates.ativo     = body.ativo
    if (body.ordem     !== undefined) updates.ordem     = body.ordem

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ status: 'error', message: 'Nenhum campo para atualizar' })
    }

    const { data, error } = await supabase
      .from('conteudo')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return reply.status(error.code === 'PGRST116' ? 404 : 500).send({
        status: 'error',
        message: error.code === 'PGRST116' ? 'Card não encontrado' : error.message,
      })
    }
    return { status: 'ok', card: data }
  })

  // ── Excluir card ───────────────────────────────────────
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const { id } = request.params as { id: string }
    const { error } = await supabase
      .from('conteudo')
      .delete()
      .eq('id', id)

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }
    return reply.status(204).send()
  })
}

// ── Helper: consulta tabela admin_users no banco ──────────────
async function isAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<boolean> {
  const user = (request as FastifyRequest & { user?: { id?: string } }).user

  if (!user?.id) {
    reply.status(401).send({ status: 'error', message: 'Usuário não autenticado' })
    return false
  }

  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) {
    reply.status(500).send({ status: 'error', message: 'Erro ao verificar permissão' })
    return false
  }

  if (!data) {
    reply.status(403).send({ status: 'error', message: 'Acesso restrito a administradores' })
    return false
  }

  return true
}
