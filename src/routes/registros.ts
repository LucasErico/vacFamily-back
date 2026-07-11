import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { authenticate } from '../middlewares/authenticate'
import { User } from '@supabase/supabase-js'

// ── Schemas ───────────────────────────────────────────────────
const criarRegistroSchema = z.object({
  vacina_id: z.string().uuid('ID de vacina inválido'),
  numero_dose: z.number().int().min(0),
  data_aplicacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (use YYYY-MM-DD)'),
  local_aplicacao: z.string().max(200).optional(),
  fabricante: z.string().max(100).optional(),
  lote: z.string().max(50).optional(),
  dose_zero: z.boolean().default(false),
  comprovante_url: z.string().url().optional(),
  observacoes: z.string().max(1000).optional(),
})

const atualizarRegistroSchema = criarRegistroSchema.partial()

type AuthRequest = { user: User }

// ── Helper: verifica posse do membro ─────────────────────────
async function membroDoUsuario(membroId: string, userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('membro_familiar')
    .select('id')
    .eq('id', membroId)
    .eq('usuario_id', userId)
    .single()
  return !!data
}

// ── Rotas ─────────────────────────────────────────────────────
export async function registrosRoutes(app: FastifyInstance) {

  /**
   * GET /registros/membro/:membroId
   * Lista historico vacinal completo de um membro
   */
  app.get('/membro/:membroId', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest
    const { membroId } = request.params as { membroId: string }

    if (!(await membroDoUsuario(membroId, user.id))) {
      return reply.status(404).send({ status: 'error', message: 'Membro não encontrado' })
    }

    const { data, error } = await supabase
      .from('registro_vacinal')
      .select('*, vacina(id, nome, nome_completo, doses_total)')
      .eq('membro_familiar_id', membroId)
      .not('vacina_id', 'is', null)
      .order('data_aplicacao', { ascending: false })

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return { status: 'ok', registros: data ?? [] }
  })

  /**
   * POST /registros/membro/:membroId
   * Registra uma dose vacinal em um membro.
   * Só aceita vacinas do catálogo oficial (vacina_id UUID obrigatório).
   */
  app.post('/membro/:membroId', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest
    const { membroId } = request.params as { membroId: string }

    if (!(await membroDoUsuario(membroId, user.id))) {
      return reply.status(404).send({ status: 'error', message: 'Membro não encontrado' })
    }

    const result = criarRegistroSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        status: 'error',
        errors: result.error.flatten().fieldErrors,
      })
    }

    const body = result.data

    const { data, error } = await supabase
      .from('registro_vacinal')
      .insert({
        ...body,
        membro_familiar_id: membroId,
      })
      .select()
      .single()

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return reply.status(201).send({ status: 'ok', registro: data })
  })

  /**
   * GET /registros/:id
   * Retorna detalhe de um registro vacinal
   */
  app.get('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest
    const { id } = request.params as { id: string }

    const { data, error } = await supabase
      .from('registro_vacinal')
      .select('*, vacina(*), membro_familiar!inner(id, nome, usuario_id)')
      .eq('id', id)
      .single()

    if (error || !data) {
      return reply.status(404).send({ status: 'error', message: 'Registro não encontrado' })
    }

    const membro = data.membro_familiar as { usuario_id: string }
    if (membro.usuario_id !== user.id) {
      return reply.status(403).send({ status: 'error', message: 'Acesso negado' })
    }

    return { status: 'ok', registro: data }
  })

  /**
   * PUT /registros/:id
   * Atualiza um registro vacinal.
   */
  app.put('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest
    const { id } = request.params as { id: string }

    const { data: existing } = await supabase
      .from('registro_vacinal')
      .select('id, membro_familiar!inner(usuario_id)')
      .eq('id', id)
      .single()

    if (!existing) {
      return reply.status(404).send({ status: 'error', message: 'Registro não encontrado' })
    }

    const membro = (existing as Record<string, unknown>).membro_familiar as { usuario_id: string }
    if (membro.usuario_id !== user.id) {
      return reply.status(403).send({ status: 'error', message: 'Acesso negado' })
    }

    const result = atualizarRegistroSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        status: 'error',
        errors: result.error.flatten().fieldErrors,
      })
    }

    const { data, error } = await supabase
      .from('registro_vacinal')
      .update({ ...result.data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return { status: 'ok', registro: data }
  })

  /**
   * DELETE /registros/:id
   * Remove um registro vacinal
   */
  app.delete('/:id', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest
    const { id } = request.params as { id: string }

    const { data: existing } = await supabase
      .from('registro_vacinal')
      .select('id, membro_familiar!inner(usuario_id)')
      .eq('id', id)
      .single()

    if (!existing) {
      return reply.status(404).send({ status: 'error', message: 'Registro não encontrado' })
    }

    const membro = (existing as Record<string, unknown>).membro_familiar as { usuario_id: string }
    if (membro.usuario_id !== user.id) {
      return reply.status(403).send({ status: 'error', message: 'Acesso negado' })
    }

    const { error } = await supabase
      .from('registro_vacinal')
      .delete()
      .eq('id', id)

    if (error) {
      return reply.status(500).send({ status: 'error', message: error.message })
    }

    return { status: 'ok', message: 'Registro removido com sucesso' }
  })

  /**
   * GET /registros/membro/:membroId/proximas
   * Retorna vacinas futuras pendentes para um membro.
   */
  app.get('/membro/:membroId/proximas', { preHandler: authenticate }, async (request, reply) => {
    const { user } = request as typeof request & AuthRequest
    const { membroId } = request.params as { membroId: string }

    if (!(await membroDoUsuario(membroId, user.id))) {
      return reply.status(404).send({ status: 'error', message: 'Membro não encontrado' })
    }

    const { data: membro } = await supabase
      .from('membro_familiar')
      .select('data_nascimento, tipo_calendario')
      .eq('id', membroId)
      .single()

    if (!membro) {
      return reply.status(404).send({ status: 'error', message: 'Membro não encontrado' })
    }

    const { data: aplicadas } = await supabase
      .from('registro_vacinal')
      .select('vacina_id, numero_dose')
      .eq('membro_familiar_id', membroId)
      .not('vacina_id', 'is', null)

    const { data: todasVacinas } = await supabase
      .from('vacina')
      .select('id, nome, nome_completo, doses_total, faixa_etaria, idade_minima_dias, obrigatoria')
      .eq('ativo', true)
      .contains('faixa_etaria', [membro.tipo_calendario])

    if (!todasVacinas) {
      return { status: 'ok', proximas: [] }
    }

    const dosesAplicadas = (aplicadas ?? []).reduce<Record<string, number[]>>((acc, r) => {
      if (!r.vacina_id) return acc
      if (!acc[r.vacina_id]) acc[r.vacina_id] = []
      acc[r.vacina_id].push(r.numero_dose)
      return acc
    }, {})

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)
    const nascimento = new Date(membro.data_nascimento)
    const idadeDias = Math.floor((Date.now() - nascimento.getTime()) / (1000 * 60 * 60 * 24))

    const proximas = todasVacinas
      .filter(v => {
        const dosesTomadas = dosesAplicadas[v.id]?.length ?? 0
        if (dosesTomadas >= v.doses_total) return false

        const idadeOk = !v.idade_minima_dias || idadeDias >= v.idade_minima_dias
        if (!idadeOk) return false

        const idadeDoseEsperadaDias = (v.idade_minima_dias ?? 0)
        const dataEsperada = new Date(nascimento)
        dataEsperada.setDate(dataEsperada.getDate() + idadeDoseEsperadaDias)
        dataEsperada.setHours(0, 0, 0, 0)

        return dataEsperada >= hoje
      })
      .map(v => ({
        vacina_id: v.id,
        nome: v.nome,
        nome_completo: v.nome_completo,
        doses_total: v.doses_total,
        doses_tomadas: dosesAplicadas[v.id]?.length ?? 0,
        doses_pendentes: v.doses_total - (dosesAplicadas[v.id]?.length ?? 0),
        obrigatoria: v.obrigatoria,
      }))

    return { status: 'ok', proximas }
  })
}
