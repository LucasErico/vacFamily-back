/**
 * Rotas do painel administrativo.
 *
 * GET    /admin/overview           — KPIs gerais
 * GET    /admin/usuarios           — lista usuários
 * POST   /admin/usuarios           — cria usuário
 * PUT    /admin/usuarios/:id       — edita nome, email, senha e flag admin
 * DELETE /admin/usuarios/:id       — remove usuário
 * GET    /admin/schema-debug       — inspeciona colunas (remover em prod)
 */
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { z } from 'zod'
import { supabase } from '../lib/supabase'
import { authenticate } from '../middlewares/authenticate'

// ── Schemas ───────────────────────────────────────────────────
const criarUsuarioSchema = z.object({
  nome:  z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  senha: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
  admin: z.boolean().optional().default(false),
})

const editarUsuarioSchema = z.object({
  nome:  z.string().min(2).optional(),
  email: z.string().email().optional(),
  senha: z.string().min(6).optional(),
  admin: z.boolean().optional(),
}).refine(d => Object.keys(d).length > 0, { message: 'Nenhum campo enviado para atualizar' })

export async function adminRoutes(app: FastifyInstance) {

  // ── schema-debug (remover após diagnóstico) ─────────────────
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

  // ── GET /admin/overview ─────────────────────────────────────
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
      return reply.status(500).send({ status: 'error', message: msg })
    }
  })

  // ── GET /admin/usuarios ─────────────────────────────────────
  app.get('/usuarios', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return
    try {
      const { data: rows, error } = await supabase
        .from('usuario')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) return reply.status(500).send({ status: 'error', message: error.message })

      const ids = (rows ?? []).map((u: Record<string, unknown>) => u.id as string)

      const [membrosRes, adminRes] = await Promise.all([
        supabase.from('membro_familiar').select('usuario_id')
          .in('usuario_id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']),
        supabase.from('admin_users').select('user_id'),
      ])

      const contagem: Record<string, number> = {}
      membrosRes.data?.forEach((m: Record<string, unknown>) => {
        const uid = m.usuario_id as string
        contagem[uid] = (contagem[uid] ?? 0) + 1
      })
      const adminIds = new Set(adminRes.data?.map((a: Record<string, unknown>) => a.user_id as string) ?? [])

      return {
        status: 'ok',
        usuarios: (rows ?? []).map((u: Record<string, unknown>) => ({
          id:       u.id as string,
          email:    (u.email ?? '') as string,
          nome:     (u.nome ?? u.name ?? '') as string,
          membros:  contagem[u.id as string] ?? 0,
          criadoEm: (u.created_at ?? u.criado_em ?? '') as string,
          admin:    adminIds.has(u.id as string),
        })),
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(500).send({ status: 'error', message: msg })
    }
  })

  // ── POST /admin/usuarios ────────────────────────────────────
  app.post('/usuarios', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const result = criarUsuarioSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ status: 'error', errors: result.error.flatten().fieldErrors })
    }
    const { nome, email, senha, admin } = result.data

    try {
      // 1. Cria no Supabase Auth
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome },
      })
      if (createError) {
        const status = createError.message.includes('already registered') ? 409 : 500
        return reply.status(status).send({ status: 'error', message: createError.message })
      }

      // 2. Insere na tabela usuario (espelha o Auth)
      await supabase.from('usuario').upsert({
        id:    created.user.id,
        email: created.user.email,
        nome,
      })

      // 3. Se admin=true, insere em admin_users
      if (admin) {
        await supabase.from('admin_users').upsert({ user_id: created.user.id })
      }

      return reply.status(201).send({
        status: 'ok',
        usuario: {
          id:       created.user.id,
          email:    created.user.email ?? '',
          nome,
          criadoEm: created.user.created_at,
          membros:  0,
          admin:    admin ?? false,
        },
      })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(500).send({ status: 'error', message: msg })
    }
  })

  // ── PUT /admin/usuarios/:id ─────────────────────────────────
  app.put('/usuarios/:id', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const { id } = request.params as { id: string }
    const caller = (request as FastifyRequest & { user?: { id?: string } }).user

    const result = editarUsuarioSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ status: 'error', errors: result.error.flatten().fieldErrors })
    }
    const { nome, email, senha, admin } = result.data

    try {
      // 1. Atualiza no Auth (email/senha/metadata)
      const authUpdate: Record<string, unknown> = {}
      if (email) authUpdate.email = email
      if (senha) authUpdate.password = senha
      if (nome)  authUpdate.user_metadata = { nome }

      if (Object.keys(authUpdate).length > 0) {
        const { error: authError } = await supabase.auth.admin.updateUserById(id, authUpdate)
        if (authError) {
          return reply.status(500).send({ status: 'error', message: authError.message })
        }
      }

      // 2. Atualiza na tabela usuario
      const tblUpdate: Record<string, unknown> = {}
      if (nome)  tblUpdate.nome  = nome
      if (email) tblUpdate.email = email
      if (Object.keys(tblUpdate).length > 0) {
        await supabase.from('usuario').update(tblUpdate).eq('id', id)
      }

      // 3. Gerencia flag admin
      if (admin === true) {
        await supabase.from('admin_users').upsert({ user_id: id })
      } else if (admin === false) {
        // Impede que o próprio admin se rebaixe
        if (caller?.id === id) {
          return reply.status(400).send({ status: 'error', message: 'Você não pode remover seu próprio acesso admin.' })
        }
        await supabase.from('admin_users').delete().eq('user_id', id)
      }

      return { status: 'ok', message: 'Usuário atualizado com sucesso' }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(500).send({ status: 'error', message: msg })
    }
  })

  // ── DELETE /admin/usuarios/:id ──────────────────────────────
  app.delete('/usuarios/:id', { preHandler: authenticate }, async (request, reply) => {
    if (!(await isAdmin(request, reply))) return

    const { id } = request.params as { id: string }
    const caller = (request as FastifyRequest & { user?: { id?: string } }).user

    if (caller?.id === id) {
      return reply.status(400).send({ status: 'error', message: 'Você não pode remover a própria conta.' })
    }

    try {
      const { error: authError } = await supabase.auth.admin.deleteUser(id)
      if (authError) {
        request.log.error({ authError }, 'deleteUser auth error — usando fallback')
        const { error: tblError } = await supabase.from('usuario').delete().eq('id', id)
        if (tblError) return reply.status(500).send({ status: 'error', message: tblError.message })
      }
      return reply.status(204).send()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      return reply.status(500).send({ status: 'error', message: msg })
    }
  })
}

// ── Helper ────────────────────────────────────────────────────
async function isAdmin(request: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const user = (request as FastifyRequest & { user?: { id?: string } }).user
  if (!user?.id) {
    reply.status(401).send({ status: 'error', message: 'Usuário não autenticado' })
    return false
  }
  try {
    const { data } = await supabase
      .from('admin_users').select('user_id').eq('user_id', user.id).maybeSingle()
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
