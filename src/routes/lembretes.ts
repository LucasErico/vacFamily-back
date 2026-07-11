import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { authenticate } from '../middlewares/authenticate'
import { User } from '@supabase/supabase-js'

// ── Schemas ───────────────────────────────────────────────────
const criarLembreteSchema = z.object({
  membro_familiar_id: z.string().uuid().optional(),
  vacina_id: z.string().uuid().optional(),
  tipo: z.enum(['campanha', 'reforco', 'manual']),
  titulo: z.string().min(2).max(200),
  descricao: z.string().max(1000).optional(),
  data_prevista: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)'),
  automatico: z.boolean().default(false),
})

const atualizarLembreteSchema = z.object({
  titulo: z.string().min(2).max(200).optional(),
  descricao: z.string().max(1000).optional(),
  data_prevista: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['pendente', 'concluido', 'ignorado']).optional(),
})

type AuthRequest = { user: User }

// ── Rotas ─────────────────────────────────────────────────────
export async function lembretesRoutes(app: FastifyInstance) {

  /**
   * GET /lembretes
   * Lista lembretes do usuario autenticado
   * Query params: status, membro_familiar_id
   */
  app.get('/', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest
    const { status, membro_familiar_id } = request.query as {
      status?: string
      membro_familiar_id?: string
    }

    let query = supabase
      .from('lembrete')
      .select('*, membro_familiar(id, nome), vacina(id, nome)')
      .eq('usuario_id', user.id)
      .order('data_prevista', { ascending: true })

    if (status) {
      query = query.eq('status', status)
    }

    if (membro_familiar_id) {
      query = query.eq('membro_familiar_id', membro_familiar_id)
    }

    const { data, error } = await query

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return { status: 'ok', lembretes: data }
  })

  /**
   * POST /lembretes
   * Cria um lembrete manual
   */
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest

    const result = criarLembreteSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        status: 'error',
        errors: result.error.flatten().fieldErrors,
      })
    }

    const { data, error } = await supabase
      .from('lembrete')
      .insert({ ...result.data, usuario_id: user.id, status: 'pendente' })
      .select()
      .single()

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return reply.status(201).send({ status: 'ok', lembrete: data })
  })

  /**
   * GET /lembretes/:id
   * Retorna detalhe de um lembrete
   */
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest
    const { id } = request.params as { id: string }

    const { data, error } = await supabase
      .from('lembrete')
      .select('*, membro_familiar(id, nome), vacina(id, nome)')
      .eq('id', id)
      .eq('usuario_id', user.id)
      .single()

    if (error || !data) {
      return reply.status(404).send({ status: 'error', message: 'Lembrete não encontrado' })
    }

    return { status: 'ok', lembrete: data }
  })

  /**
   * PATCH /lembretes/:id
   * Atualiza status ou dados de um lembrete
   */
  app.patch('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest
    const { id } = request.params as { id: string }

    const result = atualizarLembreteSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        status: 'error',
        errors: result.error.flatten().fieldErrors,
      })
    }

    const { data: existing } = await supabase
      .from('lembrete')
      .select('id')
      .eq('id', id)
      .eq('usuario_id', user.id)
      .single()

    if (!existing) {
      return reply.status(404).send({ status: 'error', message: 'Lembrete não encontrado' })
    }

    const { data, error } = await supabase
      .from('lembrete')
      .update({ ...result.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return { status: 'ok', lembrete: data }
  })

  /**
   * DELETE /lembretes/:id
   * Remove um lembrete
   */
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest
    const { id } = request.params as { id: string }

    const { data: existing } = await supabase
      .from('lembrete')
      .select('id')
      .eq('id', id)
      .eq('usuario_id', user.id)
      .single()

    if (!existing) {
      return reply.status(404).send({ status: 'error', message: 'Lembrete não encontrado' })
    }

    const { error } = await supabase
      .from('lembrete')
      .delete()
      .eq('id', id)

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return { status: 'ok', message: 'Lembrete removido com sucesso' }
  })

  /**
   * GET /lembretes/pendentes
   * Atalho: lista apenas lembretes pendentes ordenados por data
   */
  app.get('/pendentes', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest

    const { data, error } = await supabase
      .from('lembrete')
      .select('*, membro_familiar(id, nome), vacina(id, nome)')
      .eq('usuario_id', user.id)
      .eq('status', 'pendente')
      .order('data_prevista', { ascending: true })

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return { status: 'ok', lembretes: data }
  })
}
