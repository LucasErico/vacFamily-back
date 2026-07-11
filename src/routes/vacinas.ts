import { FastifyInstance } from 'fastify'
import { supabase } from '../lib/supabase'

// ── Rotas ─────────────────────────────────────────────────────
// Rotas de vacinas sao publicas (tabela de referencia)
export async function vacinasRoutes(app: FastifyInstance) {

  /**
   * GET /vacinas
   * Lista todas as vacinas cadastradas (tabela publica de referencia)
   */
  app.get('/', async (request, reply) => {
    const { ativo, faixa } = request.query as { ativo?: string; faixa?: string }

    let query = supabase
      .from('vacina')
      .select('*')
      .order('nome', { ascending: true })

    if (ativo !== undefined) {
      query = query.eq('ativo', ativo === 'true')
    }

    if (faixa) {
      query = query.contains('faixa_etaria', [faixa])
    }

    const { data, error } = await query

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return { status: 'ok', vacinas: data }
  })

  /**
   * GET /vacinas/:id
   * Retorna detalhe de uma vacina especifica
   */
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
}
