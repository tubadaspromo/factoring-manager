/**
 * Edge Function: create-payment (v20)
 *
 * SEMPRE retorna HTTP 200, mesmo em erro, para que supabase.functions.invoke()
 * nunca retorne data:null. Erros são indicados pelo campo { error: "..." } no JSON.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PAYOUT_SECRET           = Deno.env.get('PAYOUT_SECRET')           ?? ''
const SUPABASE_URL            = Deno.env.get('SUPABASE_URL')            ?? ''
const SUPABASE_ANON_KEY       = Deno.env.get('SUPABASE_ANON_KEY')       ?? ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const PAYOUT_API              = 'https://api.payoutbr.com.br/v1/transactions'
const WEBHOOK_URL             = `${SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co')}/payout-webhook`

const corsHeaders = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function ok(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? ''

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return ok({ error: 'Sessão expirada. Faça login novamente.' })

    // ── Body ─────────────────────────────────────────────────────────────────
    const body = await req.json()
    const { plan_name, document_number: docBody } = body

    if (!plan_name || !['starter', 'pro'].includes(plan_name)) {
      return ok({ error: 'Plano inválido.' })
    }

    // ── Admin client (bypassa RLS) ────────────────────────────────────────
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // ── Preço via system_settings ─────────────────────────────────────────
    const { data: setting } = await admin
      .from('system_settings')
      .select('price')
      .ilike('plan_name', plan_name)
      .single()

    const price: number = setting?.price ?? (plan_name === 'pro' ? 99.90 : 49.90)

    // ── Perfil do usuário (SEM coluna email) ──────────────────────────────
    const { data: prof, error: profErr } = await admin
      .from('profiles')
      .select('full_name, document_number, document_type')
      .eq('id', user.id)
      .single()

    // ── Inspeção completa ────────────────────────────────────────────────
    const rawDocDb    = String(prof?.document_number ?? '').replace(/\D/g, '')
    const rawDocFront = String(docBody ?? '').replace(/\D/g, '')
    const rawDoc      = rawDocDb || rawDocFront
    const docType     = String(prof?.document_type ?? (rawDoc.length === 14 ? 'cnpj' : 'cpf')).toLowerCase()

    console.log('=== INSPECAO ===')
    console.log('user.id       :', user.id)
    console.log('profErr       :', profErr?.message ?? 'ok')
    console.log('prof.doc_number:', prof?.document_number)
    console.log('rawDocDb      :', rawDocDb)
    console.log('rawDocFront   :', rawDocFront)
    console.log('rawDoc final  :', rawDoc)
    console.log('docType       :', docType)
    console.log('price         :', price)

    if (!rawDoc) {
      return ok({ error: 'CPF/CNPJ não encontrado no perfil. Atualize seus dados antes de assinar.' })
    }

    const customerName  = prof?.full_name ?? user.user_metadata?.full_name ?? 'Cliente'
    const customerEmail = user.email ?? ''

    // ── Chamada PayoutBR ──────────────────────────────────────────────────
    const basicAuth = btoa(`${PAYOUT_SECRET}:x`)

    const amountCents = Math.round(price * 100)
    const planLabel   = plan_name === 'pro' ? 'Plano Pro - Contratos Ilimitados' : 'Plano Starter - 50 Contratos'

    const payoutPayload = {
      paymentMethod: 'pix',
      amount:        amountCents,
      items: [
        {
          title:     planLabel,
          unitPrice: amountCents,
          quantity:  1,
          tangible:  false,
        },
      ],
      customer: {
        name:     customerName,
        email:    customerEmail,
        document: { number: rawDoc, type: docType },
      },
      postbackUrl: WEBHOOK_URL,
      metadata:    { user_id: user.id, plan_name },
    }

    console.log('Payload enviado:', JSON.stringify(payoutPayload))

    const payoutRes = await fetch(PAYOUT_API, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Basic ${basicAuth}`,
      },
      body: JSON.stringify(payoutPayload),
    })

    const rawText = await payoutRes.text()
    console.log('PayoutBR status  :', payoutRes.status)
    console.log('PayoutBR response:', rawText)

    let tx: Record<string, unknown> = {}
    try { tx = JSON.parse(rawText) } catch { /* mantém vazio */ }

    if (!payoutRes.ok) {
      const msg = (tx as any)?.message ?? (tx as any)?.error ?? `Erro PayoutBR (${payoutRes.status})`
      return ok({
        error:        msg,
        payout_status: payoutRes.status,
        payout_body:  tx,
        payload_sent: payoutPayload,
      })
    }

    // ── Extrair campos do QR Code ─────────────────────────────────────────
    // PayoutBR retorna: tx.pix.qrcode (EMV), sem URL de imagem direta
    const pixObj        = (tx.pix ?? {}) as Record<string, unknown>
    const pixCode       = String(pixObj.qrcode ?? '').trim() || null
    const secureUrl     = String(tx.secureUrl ?? '').trim() || null
    const transactionId = String(tx.id ?? '').trim()

    // Gera URL de imagem a partir do código EMV
    const qrImageUrl = pixCode
      ? `https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(pixCode)}`
      : null

    console.log('pixCode    :', pixCode?.slice(0, 50))
    console.log('qrImageUrl :', qrImageUrl)

    return ok({
      plan_name,
      price,
      transaction_id:  transactionId,
      qr_code:         qrImageUrl,
      pix_code:        pixCode,
      pix_qr_code_url: qrImageUrl,
      pix_copy_paste:  pixCode,
      secure_url:      secureUrl,
    })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('Erro interno:', msg)
    return ok({ error: `Erro interno: ${msg}` })
  }
})
