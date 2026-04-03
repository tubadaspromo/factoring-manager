import { useState, useEffect, useRef } from 'react'
import { Crown, X, CheckCircle2, Zap, ArrowRight, Loader2, Copy, CheckCheck, AlertCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const BRAND = '#4ABCB1'

type PlanName      = 'free' | 'starter' | 'pro'
type Step          = 'select' | 'payment'
type BillingPeriod = 'monthly' | 'quarterly' | 'semiannual' | 'annual'

const PERIOD_OPTIONS: { value: BillingPeriod; label: string; months: number }[] = [
  { value: 'monthly',    label: 'Mensal',      months: 1  },
  { value: 'quarterly',  label: 'Trimestral',  months: 3  },
  { value: 'semiannual', label: 'Semestral',   months: 6  },
  { value: 'annual',     label: 'Anual',       months: 12 },
]

const PERIOD_BILLING_LABEL: Record<BillingPeriod, string> = {
  monthly:    'Cobrado mensalmente',
  quarterly:  'Cobrado a cada 3 meses',
  semiannual: 'Cobrado a cada 6 meses',
  annual:     'Cobrado anualmente',
}

interface Plan {
  id:       'starter' | 'pro'
  label:    string
  prices:   Record<BillingPeriod, number>
  limit:    number | null
  color:    string
  gradient: string
  badge:    string
  features: string[]
}

const PLAN_UI: Record<'starter' | 'pro', Omit<Plan, 'prices' | 'limit'>> = {
  starter: {
    id:       'starter',
    label:    'Starter',
    color:    '#6B7280',
    gradient: 'linear-gradient(135deg,#4B5563,#6B7280)',
    badge:    '🥈',
    features: [
      'Gestão completa de clientes',
      'Relatórios detalhados',
      'Alertas de inadimplência',
      'Suporte via e-mail',
    ],
  },
  pro: {
    id:       'pro',
    label:    'Pro',
    color:    '#D97706',
    gradient: 'linear-gradient(135deg,#B45309,#D97706)',
    badge:    '🥇',
    features: [
      'Contratos ilimitados',
      'Tudo do Starter',
      'Exportação de relatórios',
      'Suporte prioritário WhatsApp',
      'Acesso antecipado a novidades',
    ],
  },
}

function savingsPercent(monthly: number, actual: number, months: number): number {
  const fullPrice = monthly * months
  if (!fullPrice) return 0
  return Math.round((1 - actual / fullPrice) * 100)
}

function formatPrice(price: number) {
  return price.toFixed(2).replace('.', ',')
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function UpgradeModal({
  onClose,
  currentPlan = 'free',
  onSelectPlan,
}: {
  onClose:        () => void
  currentPlan?:   PlanName
  onSelectPlan?:  (plan: 'starter' | 'pro') => void
  documentNumber?: string
}) {
  const isStarter = currentPlan === 'starter'
  const limitMsg  = isStarter
    ? 'Você atingiu o limite de contratos do Plano Starter.'
    : 'Você atingiu o limite de 3 contratos do plano Grátis.'

  const [plans,        setPlans]        = useState<Plan[]>([])
  const [plansLoading, setPlansLoading] = useState(true)
  const [period,       setPeriod]       = useState<BillingPeriod>('monthly')
  const [step,         setStep]         = useState<Step>('select')
  const [activePlan,   setActivePlan]   = useState<Plan | null>(null)
  const [loading,      setLoading]      = useState(false)
  const [payResult,    setPayResult]    = useState<any>(null)
  const [payError,     setPayError]     = useState<string | null>(null)
  const [copied,       setCopied]       = useState(false)
  const [imgLoaded,    setImgLoaded]    = useState(false)
  const [paid,         setPaid]         = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    async function fetchPlans() {
      setPlansLoading(true)
      const { data } = await (supabase.rpc as any)('get_public_plan_settings')

      if (data && data.length > 0) {
        type Row = { plan_name: string; price: number; contract_limit: number | null; billing_period: string }
        const rows = data as Row[]

        // Group rows by plan
        const grouped: Record<string, { prices: Partial<Record<BillingPeriod, number>>; limit: number | null }> = {}
        for (const row of rows) {
          const key = row.plan_name.toLowerCase() as 'starter' | 'pro'
          if (key !== 'starter' && key !== 'pro') continue
          if (!grouped[key]) grouped[key] = { prices: {}, limit: row.contract_limit }
          grouped[key].prices[row.billing_period as BillingPeriod] = Number(row.price)
          grouped[key].limit = row.contract_limit
        }

        const built: Plan[] = (Object.keys(grouped) as ('starter' | 'pro')[])
          .filter(key => PLAN_UI[key])
          .map(key => {
            const ui    = PLAN_UI[key]
            const g     = grouped[key]
            const limit = g.limit

            // Fill in missing periods with monthly as fallback
            const monthly = g.prices.monthly ?? (key === 'pro' ? 99.90 : 49.90)
            const prices: Record<BillingPeriod, number> = {
              monthly,
              quarterly:  g.prices.quarterly  ?? monthly * 3,
              semiannual: g.prices.semiannual ?? monthly * 6,
              annual:     g.prices.annual     ?? monthly * 12,
            }

            const limitText = limit == null || limit >= 999999
              ? 'Contratos ilimitados'
              : `Até ${limit} contratos ativos`

            return {
              ...ui,
              prices,
              limit,
              features: (key === 'starter' && limit != null && limit < 999999)
                ? [`Até ${limit} contratos ativos`, ...ui.features]
                : ui.features,
            } as Plan
          })
          .sort((a, b) => a.prices.monthly - b.prices.monthly)

        setPlans(built)
      } else {
        setPlans([
          {
            ...PLAN_UI.starter,
            limit: 20,
            prices: { monthly: 49.90, quarterly: 134.73, semiannual: 254.49, annual: 478.80 },
            features: ['Até 20 contratos ativos', ...PLAN_UI.starter.features],
          },
          {
            ...PLAN_UI.pro,
            limit: null,
            prices: { monthly: 99.90, quarterly: 269.73, semiannual: 509.49, annual: 958.80 },
          },
        ])
      }
      setPlansLoading(false)
    }
    fetchPlans()
  }, [])

  const visiblePlans = isStarter ? plans.filter(p => p.id === 'pro') : plans

  // Polling: verifica a cada 5s se o plano foi ativado
  useEffect(() => {
    if (step !== 'payment' || !activePlan || paid) return

    pollRef.current = setInterval(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: prof } = await (supabase.from('profiles') as any)
        .select('plan_name, plan_status')
        .eq('id', user.id)
        .single()

      if (prof?.plan_name === activePlan.id && prof?.plan_status === 'premium') {
        setPaid(true)
        if (pollRef.current) clearInterval(pollRef.current)
      }
    }, 5000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [step, activePlan, paid])

  async function handleSelectPlan(plan: Plan) {
    setActivePlan(plan)
    setStep('payment')
    setLoading(true)
    setPayResult(null)
    setPayError(null)
    setImgLoaded(false)
    setPaid(false)
    onSelectPlan?.(plan.id)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Sessão expirada. Faça login novamente.')

      const { data: prof } = await (supabase.from('profiles') as any)
        .select('document_number')
        .eq('id', user.id)
        .single()

      const docNumber = (prof?.document_number ?? '').replace(/\D/g, '') || undefined

      const { data, error: fnErr } = await (supabase.functions as any).invoke('create-payment', {
        body: { plan_name: plan.id, document_number: docNumber, billing_period: period },
      })

      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)

      setPayResult(data)
    } catch (e: any) {
      setPayError(e?.message ?? 'Erro desconhecido ao gerar pagamento.')
    } finally {
      setLoading(false)
    }
  }

  function copyPix() {
    const code = payResult?.pix_code ?? payResult?.pix_copy_paste ?? null
    if (!code) return
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const headerGradient = activePlan && step !== 'select' ? activePlan.gradient : BRAND
  const headerTitle =
    step === 'select' ? (isStarter ? 'Evolua para o Plano Pro' : 'Escolha seu Plano') :
                        `Plano ${activePlan?.label}`

  const currentPrice    = activePlan ? activePlan.prices[period] : 0
  const periodOpt       = PERIOD_OPTIONS.find(p => p.value === period)!
  const priceDisplay    = activePlan
    ? `R$ ${formatPrice(currentPrice)} · ${PERIOD_BILLING_LABEL[period]}`
    : ''
  const headerSub = step === 'select' ? limitMsg : priceDisplay

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white w-full max-w-xl rounded-[32px] shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="relative px-8 pt-9 pb-7 text-center" style={{ background: headerGradient }}>
          <button onClick={onClose} className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
          <div className="w-14 h-14 rounded-[20px] bg-white/20 flex items-center justify-center mx-auto mb-3">
            {activePlan && step !== 'select'
              ? <span className="text-3xl">{activePlan.badge}</span>
              : <Crown className="w-7 h-7 text-white" />
            }
          </div>
          <h2 className="text-white text-xl font-bold mb-1">{headerTitle}</h2>
          <p className="text-white/80 text-sm">{headerSub}</p>
        </div>

        {/* ── Step: seleção de plano ── */}
        {step === 'select' && (
          <>
            {/* Period toggle */}
            <div className="px-6 pt-5">
              <div className="flex gap-1.5 bg-slate-100 rounded-2xl p-1">
                {PERIOD_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setPeriod(opt.value)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${
                      period === opt.value
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Skeleton enquanto carrega */}
            {plansLoading && (
              <div className="px-6 py-5 grid gap-4 grid-cols-1 sm:grid-cols-2 animate-pulse">
                {[0, 1].map(i => (
                  <div key={i} className="rounded-3xl border-2 border-slate-100 overflow-hidden">
                    <div className="px-5 py-4 bg-slate-200 h-28" />
                    <div className="px-5 py-4 bg-slate-50 space-y-2.5">
                      {[0, 1, 2, 3].map(j => (
                        <div key={j} className="h-4 bg-slate-200 rounded-full w-3/4" />
                      ))}
                    </div>
                    <div className="px-5 pb-5 bg-slate-50">
                      <div className="h-11 bg-slate-200 rounded-2xl" />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className={`px-6 py-5 grid gap-4 ${plansLoading ? 'hidden' : ''} ${visiblePlans.length === 1 ? 'grid-cols-1 max-w-sm mx-auto w-full' : 'grid-cols-1 sm:grid-cols-2'}`}>
              {visiblePlans.map(plan => {
                const price   = plan.prices[period]
                const monthly = plan.prices.monthly
                const savings = period !== 'monthly' ? savingsPercent(monthly, price, periodOpt.months) : 0
                const limitText = plan.limit == null || plan.limit >= 999999
                  ? 'Contratos ilimitados'
                  : `Até ${plan.limit} contratos ativos`

                return (
                  <div key={plan.id} className="rounded-3xl border-2 overflow-hidden" style={{ borderColor: plan.color + '40' }}>
                    <div className="px-5 py-4 text-white relative" style={{ background: plan.gradient }}>
                      {savings > 0 && (
                        <span className="absolute top-3 right-3 bg-white/25 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                          Economize {savings}%
                        </span>
                      )}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xl">{plan.badge}</span>
                        <span className="font-bold text-lg">Plano {plan.label}</span>
                      </div>
                      <div className="flex items-end gap-1">
                        <span className="text-3xl font-bold">R$ {formatPrice(price)}</span>
                      </div>
                      <p className="text-white/70 text-xs mt-1">{PERIOD_BILLING_LABEL[period]}</p>
                      {period !== 'monthly' && (
                        <p className="text-white/60 text-[11px] mt-0.5">
                          equiv. R$ {formatPrice(price / periodOpt.months)}/mês
                        </p>
                      )}
                      <p className="text-white/80 text-xs mt-1">{limitText}</p>
                    </div>
                    <div className="px-5 py-4 bg-slate-50 flex flex-col gap-2.5">
                      {plan.features.map(f => (
                        <div key={f} className="flex items-start gap-2">
                          <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" style={{ color: plan.color }} />
                          <span className="text-sm text-gray-700">{f}</span>
                        </div>
                      ))}
                    </div>
                    <div className="px-5 pb-5 bg-slate-50">
                      <button
                        onClick={() => handleSelectPlan(plan)}
                        className="w-full py-3 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                        style={{ background: plan.gradient }}
                        onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.88)')}
                        onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
                      >
                        Assinar {plan.label} <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <div className="px-8 pb-7 text-center">
              <p className="text-xs text-gray-400">Sem fidelidade · Cancele quando quiser · Pagamento via Pix</p>
              <button onClick={onClose} className="mt-3 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                Continuar com o plano atual
              </button>
            </div>
          </>
        )}

        {/* ── Step: pagamento ── */}
        {step === 'payment' && (
          <div className="px-8 py-7">

            {/* Carregando */}
            {loading && (
              <div className="flex flex-col items-center py-12 gap-4">
                <Loader2 className="w-12 h-12 animate-spin" style={{ color: BRAND }} />
                <p className="text-gray-500 text-sm font-medium">Gerando QR Code Pix...</p>
              </div>
            )}

            {/* Erro */}
            {!loading && payError && (
              <div className="space-y-4">
                <div className="flex items-start gap-3 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                  <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                  <p className="text-red-600 text-sm">{payError}</p>
                </div>
                <button
                  onClick={() => setStep('select')}
                  className="w-full py-3 rounded-2xl text-white text-sm font-semibold"
                  style={{ background: BRAND }}
                >
                  ← Voltar aos planos
                </button>
              </div>
            )}

            {/* Pagamento confirmado */}
            {paid && (
              <div className="flex flex-col items-center py-8 gap-4 text-center">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="w-10 h-10 text-green-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">Pagamento Confirmado!</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Seu plano <span className="font-semibold capitalize">{activePlan?.label}</span> já está ativo.
                  </p>
                </div>
                <button
                  onClick={() => { onClose(); window.location.reload() }}
                  className="mt-2 w-full py-3 rounded-2xl text-white text-sm font-semibold transition-all active:scale-[0.98]"
                  style={{ background: activePlan?.gradient ?? BRAND }}
                >
                  Ir para o Dashboard
                </button>
              </div>
            )}

            {/* QR Code */}
            {!paid && !loading && payResult && !payError && (
              <div className="space-y-5">

                {/* Imagem do QR Code */}
                {payResult.qr_code && (
                  <div className="flex justify-center">
                    <div className="relative p-3 bg-white border-2 border-slate-100 rounded-2xl shadow-sm">
                      {!imgLoaded && (
                        <div className="absolute inset-3 flex items-center justify-center bg-slate-50 rounded-xl">
                          <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
                        </div>
                      )}
                      <img
                        src={payResult.qr_code}
                        alt="QR Code Pix"
                        className={`w-52 h-52 object-contain transition-opacity ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                        onLoad={() => setImgLoaded(true)}
                        onError={() => setImgLoaded(true)}
                      />
                    </div>
                  </div>
                )}

                {/* Resumo */}
                <div className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3">
                  <div>
                    <p className="text-xs text-gray-400">Plano {activePlan?.label} · {PERIOD_OPTIONS.find(p => p.value === period)?.label}</p>
                    <p className="text-xs text-gray-400">{PERIOD_BILLING_LABEL[period]}</p>
                  </div>
                  <p className="text-lg font-bold text-gray-900">
                    R$ {formatPrice(payResult.price ?? currentPrice)}
                  </p>
                </div>

                {/* Copia e cola */}
                {payResult.pix_code && (
                  <>
                    <div>
                      <p className="text-xs text-gray-400 text-center mb-2">Pix copia e cola</p>
                      <textarea
                        readOnly
                        value={payResult.pix_code}
                        rows={3}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-gray-600 font-mono resize-none focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={copyPix}
                      className="w-full py-4 rounded-2xl text-white text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                      style={{ background: copied ? '#16a34a' : BRAND }}
                    >
                      {copied
                        ? <><CheckCheck className="w-5 h-5" /> Copiado!</>
                        : <><Copy className="w-5 h-5" /> Copiar Código Pix</>
                      }
                    </button>
                  </>
                )}

                <p className="text-xs text-gray-400 text-center">
                  Após o pagamento, seu plano será ativado automaticamente em até 5 minutos.
                </p>
                <button onClick={onClose} className="w-full py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors">
                  Fechar
                </button>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

// ─── Plan badge (compartilhado) ───────────────────────────────────────────────

export function PlanBadge({ planName, size = 'sm' }: { planName: PlanName; size?: 'sm' | 'xs' }) {
  if (planName === 'pro') {
    return (
      <span className={`inline-flex items-center gap-1 font-bold px-2.5 py-1 rounded-xl bg-amber-50 text-amber-600 ${size === 'xs' ? 'text-[10px]' : 'text-[11px]'}`}>
        🥇 Pro
      </span>
    )
  }
  if (planName === 'starter') {
    return (
      <span className={`inline-flex items-center gap-1 font-bold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 ${size === 'xs' ? 'text-[10px]' : 'text-[11px]'}`}>
        🥈 Starter
      </span>
    )
  }
  return (
    <span className={`inline-flex items-center gap-1 font-bold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-400 ${size === 'xs' ? 'text-[10px]' : 'text-[11px]'}`}>
      <Zap className="w-3 h-3" /> Grátis
    </span>
  )
}
