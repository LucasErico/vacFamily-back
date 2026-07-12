/**
 * Rotas de vacinas.
 *
 * GET    /vacinas          — público: lista todas as vacinas
 * GET    /vacinas/:id      — público: detalhe de uma vacina
 * POST   /vacinas          — admin:   cria vacina
 * PUT    /vacinas/:id      — admin:   atualiza vacina
 * DELETE /vacinas/:id      — admin:   remove vacina
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { supabase } from '../lib/supabase'
import { authenticate } from '../middlewares/authenticate'

export async function vacinasRoutes(app: FastifyInstance) {

  /** GET /vacinas */
  app.get('/', async (request, reply) => {
    const { ativo, faixa } = request.query as { ativo?: string; faixa?: string }

    let query = supabase
      .from('vacina')
      .select('*')
      .order('nome', { ascending: true })

    if (ativo !== undefined) query = query.eq('ativo', ativo === 'true')
    if (faixa)               query = query.contains('faixa_etaria', [faixa])

    const { data, error } = await query
    if (error) return reply.status(500).send({ status: 'error', message: error.message })
    return { status: 'ok', vacinas: data }
  })

  /** GET /vacinas/:id */
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const { data, error } = await supabase
      .from('vacina')
      .select('*, regra_reforco(*)')
      .eq('id', id)
      .single()

    if (error || !data) {
      return reply.status(404).send({ status: 'error', message: 'Vacina não encontrada' })
    }
    return { status: 'ok', vacina: data }
  })

  /** POST /vacinas — admin */
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const body = request.body as {
      nome: string
      descricao?: string
      doses: number
      faixa_etaria?: string[]
      obrigatoria?: boolean
      ativo?: boolean
    }

    if (!body.nome?.trim()) {
      return reply.status(400).send({ status: 'error', message: 'Campo obrigatório: nome' })
    }

    const { data, error } = await supabase
      .from('vacina')
      .insert({
        nome:        body.nome.trim(),
        descricao:   body.descricao?.trim() ?? null,
        doses:       body.doses ?? 1,
        faixa_etaria: body.faixa_etaria ?? [],
        obrigatoria: body.obrigatoria ?? true,
        ativo:       body.ativo ?? true,
      })
      .select()
      .single()

    if (error) return reply.status(500).send({ status: 'error', message: error.message })
    return reply.status(201).send({ status: 'ok', vacina: data })
  })

  /** PUT /vacinas/:id — admin */
  app.put('/:id', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const { id } = request.params as { id: string }
    const body = request.body as Partial<{
      nome: string
      descricao: string
      doses: number
      faixa_etaria: string[]
      obrigatoria: boolean
      ativo: boolean
    }>

    const updates: Record<string, unknown> = {}
    if (body.nome        !== undefined) updates.nome         = body.nome.trim()
    if (body.descricao   !== undefined) updates.descricao    = body.descricao.trim()
    if (body.doses       !== undefined) updates.doses        = body.doses
    if (body.faixa_etaria !== undefined) updates.faixa_etaria = body.faixa_etaria
    if (body.obrigatoria !== undefined) updates.obrigatoria  = body.obrigatoria
    if (body.ativo       !== undefined) updates.ativo        = body.ativo

    if (Object.keys(updates).length === 0) {
      return reply.status(400).send({ status: 'error', message: 'Nenhum campo para atualizar' })
    }

    const { data, error } = await supabase
      .from('vacina')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return reply.status(error.code === 'PGRST116' ? 404 : 500).send({
        status: 'error',
        message: error.code === 'PGRST116' ? 'Vacina não encontrada' : error.message,
      })
    }
    return { status: 'ok', vacina: data }
  })

  /** DELETE /vacinas/:id — admin */
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const { id } = request.params as { id: string }
    const { error } = await supabase.from('vacina').delete().eq('id', id)
    if (error) return reply.status(500).send({ status: 'error', message: error.message })
    return reply.status(204).send()
  })
}

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
