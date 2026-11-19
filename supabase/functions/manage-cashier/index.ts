// Edge Function: crear/editar cajeros (requiere service_role).
// Desplegar: supabase functions deploy manage-cashier
// Variables necesarias (ya vienen en Supabase): SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

type Body = {
  tenantId: string
  userId?: string
  name: string
  email: string
  password?: string
  active: boolean
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  try {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!token) return json({ error: 'Falta el token de acceso' }, 401)

    const url = Deno.env.get('SUPABASE_URL')!
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: authData, error: authError } = await caller.auth.getUser()
    if (authError || !authData.user) return json({ error: 'Sesión inválida' }, 401)

    const body = (await req.json()) as Body
    const tenantId = String(body.tenantId ?? '')
    const email = String(body.email ?? '').trim().toLowerCase()
    const name = String(body.name ?? '').trim()
    if (!tenantId || !email || !name) return json({ error: 'Faltan datos del cajero' }, 400)

    // Solo el dueño del negocio puede gestionar cajeros.
    const { data: membership } = await admin
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenantId)
      .eq('user_id', authData.user.id)
      .eq('active', true)
      .maybeSingle()

    if (membership?.role !== 'owner') {
      return json({ error: 'Solo el dueño puede gestionar cajeros' }, 403)
    }

    let userId = body.userId

    if (userId) {
      const update: Record<string, unknown> = {
        email,
        user_metadata: { name },
      }
      if (body.password) update.password = body.password

      const { error } = await admin.auth.admin.updateUserById(userId, update)
      if (error) return json({ error: error.message }, 400)

      const { error: memberError } = await admin
        .from('tenant_members')
        .update({ email, display_name: name, active: body.active })
        .eq('tenant_id', tenantId)
        .eq('user_id', userId)

      if (memberError) return json({ error: memberError.message }, 400)
    } else {
      if (!body.password) return json({ error: 'La contraseña es obligatoria' }, 400)

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email,
        password: body.password,
        email_confirm: true,
        user_metadata: { name },
      })
      if (createError) {
        const message = createError.message.toLowerCase().includes('already')
          ? 'Ya existe una cuenta con ese correo'
          : createError.message
        return json({ error: message }, 400)
      }
      userId = created.user.id

      const { error: memberError } = await admin.from('tenant_members').insert({
        tenant_id: tenantId,
        user_id: userId,
        role: 'cashier',
        email,
        display_name: name,
        active: body.active,
      })

      if (memberError) {
        await admin.auth.admin.deleteUser(userId)
        return json({ error: memberError.message }, 400)
      }
    }

    return json({ id: userId, name, email, active: body.active })
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Error inesperado' }, 500)
  }
})
