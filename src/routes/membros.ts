import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { authenticate } from '../middlewares/authenticate'
import { User } from '@supabase/supabase-js'

// ── Schemas ───────────────────────────────────────────────────
const criarMembroSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
  data_nascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)'),
  sexo: z.enum(['M', 'F', 'outro']),
  relacao: z.enum(['titular', 'conjuge', 'filho', 'filha', 'pai', 'mae', 'avo', 'avo_materna', 'outro']),
  tipo_calendario: z.enum(['infantil', 'adolescente', 'adulto', 'gestante', 'idoso', 'especial']),
  gestacao_semanas: z.number().int().min(1).max(42).optional(),
  mae_id: z.string().uuid().optional(),
  observacoes: z.string().max(1000).optional(),
  foto_url: z.string().url().optional(),
})

const atualizarMembroSchema = criarMembroSchema.partial()

type AuthRequest = { user: User }

// ── Rotas ─────────────────────────────────────────────────────
export async function membrosRoutes(app: FastifyInstance) {

  /**
   * GET /membros
   * Lista todos os membros familiares do usuario autenticado
   */
  app.get('/', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest

    const { data, error } = await supabase
      .from('membro_familiar')
      .select('*')
      .eq('usuario_id', user.id)
      .order('created_at', { ascending: true })

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return { status: 'ok', membros: data }
  })

  /**
   * POST /membros
   * Cadastra novo membro familiar
   */
  app.post('/', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest

    const result = criarMembroSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        status: 'error',
        errors: result.error.flatten().fieldErrors,
      })
    }

    const { data, error } = await supabase
      .from('membro_familiar')
      .insert({ ...result.data, usuario_id: user.id })
      .select()
      .single()

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return reply.status(201).send({ status: 'ok', membro: data })
  })

  /**
   * GET /membros/:id
   * Retorna detalhe de um membro (somente do usuario autenticado)
   */
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest
    const { id } = request.params as { id: string }

    const { data, error } = await supabase
      .from('membro_familiar')
      .select('*')
      .eq('id', id)
      .eq('usuario_id', user.id)
      .single()

    if (error || !data) {
      return reply.status(404).send({ status: 'error', message: 'Membro não encontrado' })
    }

    return { status: 'ok', membro: data }
  })

  /**
   * PUT /membros/:id
   * Atualiza dados de um membro
   */
  app.put('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest
    const { id } = request.params as { id: string }

    const result = atualizarMembroSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        status: 'error',
        errors: result.error.flatten().fieldErrors,
      })
    }

    // Verifica propriedade antes de atualizar
    const { data: existing } = await supabase
      .from('membro_familiar')
      .select('id')
      .eq('id', id)
      .eq('usuario_id', user.id)
      .single()

    if (!existing) {
      return reply.status(404).send({ status: 'error', message: 'Membro não encontrado' })
    }

    const { data, error } = await supabase
      .from('membro_familiar')
      .update({ ...result.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return { status: 'ok', membro: data }
  })

  /**
   * DELETE /membros/:id
   * Remove um membro familiar
   */
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest
    const { id } = request.params as { id: string }

    const { data: existing } = await supabase
      .from('membro_familiar')
      .select('id')
      .eq('id', id)
      .eq('usuario_id', user.id)
      .single()

    if (!existing) {
      return reply.status(404).send({ status: 'error', message: 'Membro não encontrado' })
    }

    const { error } = await supabase
      .from('membro_familiar')
      .delete()
      .eq('id', id)

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return { status: 'ok', message: 'Membro removido com sucesso' }
  })
}
