import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { supabase } from '../lib/supabase'

// ── Schemas de validacao ──────────────────────────────────────
const registerSchema = z.object({
  nome: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
  email: z.string().email('Email invalido'),
  senha: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
})

const loginSchema = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
})

const forgotPasswordSchema = z.object({
  email: z.string().email(),
})

const resetPasswordSchema = z.object({
  senha: z.string().min(6, 'Nova senha deve ter ao menos 6 caracteres'),
})

// ── Rotas ────────────────────────────────────────────────
export async function authRoutes(app: FastifyInstance) {

  /**
   * POST /auth/register
   * Cadastra novo usuario via Supabase Auth e retorna sessão imediata.
   * Usa admin.createUser com email_confirm:true para dispensar verificação,
   * depois faz signInWithPassword para obter o access_token.
   */
  app.post('/register', async (request, reply) => {
    const result = registerSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        status: 'error',
        errors: result.error.flatten().fieldErrors,
      })
    }

    const { nome, email, senha } = result.data

    // 1. Cria usuário com email já confirmado
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    })

    if (createError) {
      if (createError.message.includes('already registered')) {
        return reply.status(409).send({
          status: 'error',
          message: 'Email ja cadastrado',
        })
      }
      return reply.status(500).send({
        status: 'error',
        message: createError.message,
      })
    }

    // 2. Faz login imediato para obter o JWT da sessão
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseAuth = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: session, error: loginError } = await supabaseAuth.auth.signInWithPassword({
      email,
      password: senha,
    })

    if (loginError || !session?.session) {
      // Usuário criado mas login falhou — retorna sem token (frontend trata)
      return reply.status(201).send({
        status: 'ok',
        requiresVerification: false,
        message: 'Usuario cadastrado. Faça login para continuar.',
        usuario: {
          id: created.user.id,
          email: created.user.email,
          nome,
          created_at: created.user.created_at,
        },
      })
    }

    return reply.status(201).send({
      status: 'ok',
      access_token: session.session.access_token,
      refresh_token: session.session.refresh_token,
      expires_in: session.session.expires_in,
      requiresVerification: false,
      usuario: {
        id: session.user.id,
        email: session.user.email,
        nome: session.user.user_metadata?.nome ?? nome,
        created_at: session.user.created_at,
      },
    })
  })

  /**
   * POST /auth/login
   * Autentica usuario e retorna session JWT do Supabase
   */
  app.post('/login', async (request, reply) => {
    const result = loginSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        status: 'error',
        errors: result.error.flatten().fieldErrors,
      })
    }

    const { email, senha } = result.data

    const { createClient } = await import('@supabase/supabase-js')
    const supabaseAuth = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await supabaseAuth.auth.signInWithPassword({
      email,
      password: senha,
    })

    if (error) {
      return reply.status(401).send({
        status: 'error',
        message: 'Email ou senha incorretos',
      })
    }

    return {
      status: 'ok',
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_in: data.session.expires_in,
      usuario: {
        id: data.user.id,
        email: data.user.email,
        nome: data.user.user_metadata?.nome ?? '',
        created_at: data.user.created_at,
      },
    }
  })

  /**
   * POST /auth/logout
   * Invalida a sessao do usuario (requer token valido)
   */
  app.post('/logout', async (request, reply) => {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ status: 'error', message: 'Token ausente' })
    }

    const token = authHeader.replace('Bearer ', '')
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUser = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )

    await supabaseUser.auth.signOut()

    return { status: 'ok', message: 'Logout realizado com sucesso' }
  })

  /**
   * POST /auth/forgot-password
   * Envia email de recuperacao de senha
   */
  app.post('/forgot-password', async (request, reply) => {
    const result = forgotPasswordSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        status: 'error',
        errors: result.error.flatten().fieldErrors,
      })
    }

    const { email } = result.data
    const frontUrl = process.env.FRONT_URL?.split(',')[0].trim() ?? 'http://localhost:5173'

    const { createClient } = await import('@supabase/supabase-js')
    const supabaseAuth = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { error } = await supabaseAuth.auth.resetPasswordForEmail(email, {
      redirectTo: `${frontUrl}/reset-password`,
    })

    if (error) {
      return reply.status(500).send({
        status: 'error',
        message: error.message,
      })
    }

    return {
      status: 'ok',
      message: 'Se o email estiver cadastrado, voce recebera as instrucoes de recuperacao',
    }
  })

  /**
   * POST /auth/reset-password
   * Redefine a senha com o token do email de recuperacao
   */
  app.post('/reset-password', async (request, reply) => {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ status: 'error', message: 'Token de reset ausente' })
    }

    const result = resetPasswordSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({
        status: 'error',
        errors: result.error.flatten().fieldErrors,
      })
    }

    const token = authHeader.replace('Bearer ', '')
    const { senha } = result.data

    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUser = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )

    const { error } = await supabaseUser.auth.updateUser({ password: senha })

    if (error) {
      return reply.status(400).send({
        status: 'error',
        message: error.message,
      })
    }

    return { status: 'ok', message: 'Senha redefinida com sucesso' }
  })

  /**
   * GET /auth/me
   * Retorna dados do usuario autenticado
   */
  app.get('/me', async (request, reply) => {
    const authHeader = request.headers.authorization
    if (!authHeader?.startsWith('Bearer ')) {
      return reply.status(401).send({ status: 'error', message: 'Token ausente' })
    }

    const token = authHeader.replace('Bearer ', '')
    const { createClient } = await import('@supabase/supabase-js')
    const supabaseUser = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
        auth: { autoRefreshToken: false, persistSession: false },
      }
    )

    const { data: { user }, error } = await supabaseUser.auth.getUser()

    if (error || !user) {
      return reply.status(401).send({
        status: 'error',
        message: 'Token invalido ou expirado',
      })
    }

    // Busca dados complementares na tabela usuario
    const { data: perfil } = await supabase
      .from('usuario')
      .select('*')
      .eq('id', user.id)
      .single()

    return {
      status: 'ok',
      usuario: {
        id: user.id,
        email: user.email,
        nome: perfil?.nome ?? user.user_metadata?.nome ?? '',
        created_at: user.created_at,
      },
    }
  })
}
