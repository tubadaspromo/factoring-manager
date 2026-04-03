import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  RefreshCw, Shield, Crown, Lock, Users, FileText,
  DollarSign, ChevronRight, X, Save, Loader2,
} from 'lucide-react'

const BRAND = '#4ABCB1'

type PlanStatus = 'free' | 'premium' | 'trial'

interface AdminCredor {
  id: string
  full_name: string | null
  phone: string | null
  plan_status: PlanStatus
  plan_expires_at: string | null
  contract_count: number
  active_capital: number
  created_at: string
}

interface AdminStats {
  total_users: number
  total_contracts: number
  total_capital: number
  premium_users: number
  free_users: number
  credores: AdminCredor[]
}

interface CredorContract {
  id: string
  total_amount: number
  status: string
  contract_date: string
  contract_number: string | null
  clients: { name: string } | null
}

interface WithdrawalRequest {
  id: string
  user_id: string
  amount: number
  pix_key: string
  status: 'pending' | 'approved' | 'paid' | 'rejected'
  requested_at: string
  profiles: { full_name: string | null; email: string } | null
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

const STATUS_LABEL: Record<string, string> = {
  active:    'Pendente',
  overdue:   'Atrasado',
  settled:   'Pago',
  cancelled: 'Cancelado',
}

const STATUS_STYLE: Record<string, string> = {
  active:    'bg-blue-50 text-blue-500',
  overdue:   'bg-red-50 text-red-500',
  settled:   'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-slate-100 text-slate-400',
}

export function MasterAdmin({ stats, loading, onSetPlan, onReload }: {
  stats: AdminStats | null
  loading: boolean
  onSetPlan: (userId: string, plan: PlanStatus) => void
  onReload: () => void
}) {
  const [selectedCredor, setSelectedCredor]       = useState<AdminCredor | null>(null)
  const [credorContracts, setCredorContracts]     = useState<CredorContract[]>([])
  const [loadingContracts, setLoadingContracts]   = useState(false)
  const [withdrawals, setWithdrawals]             = useState<WithdrawalRequest[]>([])
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false)
  const [activeTab, setActiveTab]                 = useState<'credores' | 'resgates' | 'precos'>('credores')

  // ── Plan prices state ─────────────────────────────────────────────────────
  interface PriceRow {
    id: string
    plan_name: string
    billing_period: string
    price: number
    contract_limit: number | null
  }
  const [priceRows, setPriceRows]       = useState<PriceRow[]>([])
  const [priceEdits, setPriceEdits]     = useState<Record<string, { price: string; limit: string; unlimited: boolean }>>({})
  const [savingPrice, setSavingPrice]   = useState<string | null>(null)
  const [loadingPrices, setLoadingPrices] = useState(false)

  const PERIOD_LABEL: Record<string, string> = {
    monthly:    'Mensal',
    quarterly:  'Trimestral',
    semiannual: 'Semestral',
    annual:     'Anual',
  }

  async function loadPrices() {
    setLoadingPrices(true)
    try {
      const { data } = await (supabase.from('system_settings') as any)
        .select('id, plan_name, billing_period, price, contract_limit')
        .in('plan_name', ['Starter', 'Pro', 'starter', 'pro'])
        .order('plan_name')
        .order('billing_period')
      const rows = (data ?? []) as PriceRow[]
      setPriceRows(rows)
      const edits: Record<string, { price: string; limit: string; unlimited: boolean }> = {}
      for (const r of rows) {
        const unlimited = r.contract_limit == null || r.contract_limit >= 999999
        edits[r.id] = {
          price:     Number(r.price).toFixed(2),
          limit:     !unlimited && r.contract_limit != null ? String(r.contract_limit) : '',
          unlimited,
        }
      }
      setPriceEdits(edits)
    } catch (e) { console.error('[loadPrices]', e) }
    setLoadingPrices(false)
  }

  useEffect(() => {
    if (activeTab === 'precos') loadPrices()
  }, [activeTab])

  async function savePriceRow(id: string) {
    const edit = priceEdits[id]
    if (!edit) return
    setSavingPrice(id)
    const price = parseFloat(edit.price.replace(',', '.'))
    const limit = edit.unlimited ? null : (edit.limit ? parseInt(edit.limit) : null)
    if (isNaN(price)) { setSavingPrice(null); return }
    await (supabase.from('system_settings') as any)
      .update({ price, contract_limit: limit, updated_at: new Date().toISOString() })
      .eq('id', id)
    setPriceRows(prev => prev.map(r => r.id === id ? { ...r, price, contract_limit: limit } : r))
    setSavingPrice(null)
  }

  async function viewCredorContracts(credor: AdminCredor) {
    setSelectedCredor(credor)
    setLoadingContracts(true)
    try {
      const { data } = await (supabase.from('contracts') as any)
        .select('id, total_amount, status, contract_date, contract_number, clients(name)')
        .eq('user_id', credor.id)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(30)
      setCredorContracts((data ?? []) as CredorContract[])
    } catch {
      setCredorContracts([])
    }
    setLoadingContracts(false)
  }

  async function loadWithdrawals() {
    setLoadingWithdrawals(true)
    try {
      const { data } = await (supabase.from('cashback_withdrawals') as any)
        .select('id, user_id, amount, pix_key, status, requested_at, profiles(full_name, email)')
        .order('requested_at', { ascending: false })
        .limit(100)
      setWithdrawals((data ?? []) as WithdrawalRequest[])
    } catch (e) { console.error('[loadWithdrawals]', e) }
    setLoadingWithdrawals(false)
  }

  async function updateWithdrawal(id: string, status: 'approved' | 'paid' | 'rejected') {
    await (supabase.from('cashback_withdrawals') as any)
      .update({ status, processed_at: new Date().toISOString() })
      .eq('id', id)
    setWithdrawals(prev => prev.map(w => w.id === id ? { ...w, status } : w))
  }

  return (
    <>
      {/* Page header */}
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-amber-500" />
            <h1 className="text-2xl font-semibold text-gray-900">Painel Master</h1>
          </div>
          <p className="text-gray-400 text-sm">Visão administrativa de todos os credores da plataforma</p>
        </div>
        <button
          onClick={onReload}
          disabled={loading}
          className="flex items-center gap-2 text-gray-500 text-sm font-medium px-4 py-2.5 rounded-2xl border border-gray-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* Metric cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ background: '#F59E0B20' }}>
            <Users className="w-5 h-5 text-amber-500" />
          </div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Credores</p>
          <p className="text-2xl font-bold text-gray-900">{stats?.total_users ?? '—'}</p>
          <p className="text-xs text-gray-400 mt-1">
            {stats?.premium_users ?? 0} premium · {stats?.free_users ?? 0} grátis
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ background: '#4ABCB115' }}>
            <FileText className="w-5 h-5" style={{ color: BRAND }} />
          </div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Total Contratos</p>
          <p className="text-2xl font-bold text-gray-900">{stats?.total_contracts ?? '—'}</p>
        </div>

        <div className="rounded-3xl p-6 shadow-sm" style={{ background: BRAND }}>
          <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center mb-3">
            <DollarSign className="w-5 h-5 text-white" />
          </div>
          <p className="text-xs font-semibold text-white/70 uppercase tracking-wider mb-1">Capital Total</p>
          <p className="text-2xl font-bold text-white">
            {stats ? formatCurrency(stats.total_capital) : '—'}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {([
          { id: 'credores', label: 'Credores' },
          { id: 'resgates', label: 'Resgates de Cashback' },
          { id: 'precos',   label: 'Preços dos Planos' },
        ] as { id: typeof activeTab; label: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id)
              if (tab.id === 'resgates') loadWithdrawals()
            }}
            className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all ${
              activeTab === tab.id ? 'text-white' : 'bg-white text-gray-500 hover:bg-slate-50 border border-slate-100'
            }`}
            style={activeTab === tab.id ? { background: BRAND } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Credores table */}
      {activeTab === 'credores' && (
        <div className="bg-white rounded-[32px] shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
            <h2 className="text-base font-semibold text-gray-900">Credores</h2>
            <span className="text-xs text-gray-400">{stats?.credores?.length ?? 0} usuários cadastrados</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div
                className="w-7 h-7 border-2 rounded-full animate-spin"
                style={{ borderColor: BRAND, borderTopColor: 'transparent' }}
              />
            </div>
          ) : !stats || stats.credores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <p className="text-gray-400 text-sm">Nenhum credor encontrado.</p>
            </div>
          ) : (
            <>
              {/* Table header */}
              <div className="hidden md:grid grid-cols-[1fr_120px_90px_150px_140px] gap-2 px-6 py-3 border-b border-slate-50">
                {['Credor', 'Plano', 'Contratos', 'Capital Ativo', 'Ações'].map(h => (
                  <span key={h} className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{h}</span>
                ))}
              </div>

              <div>
                {stats.credores.map(credor => (
                  <div
                    key={credor.id}
                    className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_120px_90px_150px_140px] gap-2 items-center px-6 py-4 hover:bg-slate-50/50 transition-colors"
                  >
                    {/* Name */}
                    <div className="flex items-center gap-3">
                      <div
                        className="w-9 h-9 rounded-2xl flex items-center justify-center text-white text-sm font-semibold shrink-0"
                        style={{ background: BRAND + 'CC' }}
                      >
                        {(credor.full_name ?? '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">
                          {credor.full_name ?? 'Sem nome'}
                        </p>
                        <p className="text-xs text-gray-400">{credor.phone ?? '—'}</p>
                      </div>
                    </div>

                    {/* Plan badge */}
                    <div className="hidden md:flex">
                      {credor.plan_status === 'premium' ? (
                        <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-xl bg-amber-50 text-amber-600">
                          <Crown className="w-3 h-3" />Premium
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-500">
                          <Lock className="w-3 h-3" />Grátis
                        </span>
                      )}
                    </div>

                    {/* Contract count */}
                    <div className="hidden md:block">
                      <span className="text-sm font-medium text-gray-700">{credor.contract_count}</span>
                    </div>

                    {/* Capital */}
                    <div className="hidden md:block">
                      <span className="text-sm font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(credor.active_capital)}
                      </span>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 justify-end md:justify-start">
                      <button
                        onClick={() => viewCredorContracts(credor)}
                        className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-colors hover:opacity-80"
                        style={{ background: '#4ABCB115', color: BRAND }}
                        title="Visualizar contratos"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Ver</span>
                      </button>

                      {credor.plan_status !== 'premium' ? (
                        <button
                          onClick={() => onSetPlan(credor.id, 'premium')}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-amber-50 text-amber-600 hover:bg-amber-100 transition-colors"
                          title="Conceder Premium"
                        >
                          <Crown className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Premium</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => onSetPlan(credor.id, 'free')}
                          className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-colors"
                          title="Revogar Premium"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">Revogar</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Prices panel */}
      {activeTab === 'precos' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Preços dos Planos</h2>
              <p className="text-xs text-gray-400 mt-0.5">Alterações refletem imediatamente no modal de assinatura</p>
            </div>
            <button onClick={loadPrices} className="p-2 rounded-xl text-gray-400 hover:bg-white transition-colors">
              <RefreshCw className={`w-4 h-4 ${loadingPrices ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {loadingPrices ? (
            <div className="bg-white rounded-3xl flex justify-center py-12 shadow-sm">
              <div className="w-6 h-6 border-2 border-gray-200 rounded-full animate-spin" style={{ borderTopColor: BRAND }} />
            </div>
          ) : priceRows.length === 0 ? (
            <div className="bg-white rounded-3xl text-center py-12 text-gray-400 text-sm shadow-sm">Nenhum preço configurado.</div>
          ) : (
            // Group rows by plan
            (['starter', 'pro'] as const).map(planKey => {
              const rows = priceRows.filter(r => r.plan_name.toLowerCase() === planKey)
              if (rows.length === 0) return null

              const PERIOD_ORDER = ['monthly', 'quarterly', 'semiannual', 'annual']
              const sorted = [...rows].sort((a, b) =>
                PERIOD_ORDER.indexOf(a.billing_period) - PERIOD_ORDER.indexOf(b.billing_period)
              )

              const planColor  = planKey === 'pro' ? '#D97706' : '#6B7280'
              const planBg     = planKey === 'pro' ? '#FEF3C7' : '#F1F5F9'
              const planLabel  = planKey === 'pro' ? '🥇 Plano Pro' : '🥈 Plano Starter'

              return (
                <div key={planKey} className="bg-white rounded-[28px] shadow-sm overflow-hidden">
                  {/* Plan header */}
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
                    <span className="text-sm font-bold px-3 py-1.5 rounded-xl"
                      style={{ color: planColor, background: planBg }}>
                      {planLabel}
                    </span>
                  </div>

                  {/* Column header */}
                  <div className="grid grid-cols-[160px_1fr_1fr_110px] gap-4 px-6 py-2.5 bg-slate-50 border-b border-slate-100">
                    {['Período', 'Preço (R$)', 'Limite de contratos', ''].map(h => (
                      <span key={h} className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{h}</span>
                    ))}
                  </div>

                  {/* Rows */}
                  {sorted.map((row, idx) => {
                    const edit     = priceEdits[row.id] ?? { price: String(row.price), limit: '', unlimited: true }
                    const isSaving = savingPrice === row.id

                    return (
                      <div
                        key={row.id}
                        className={`grid grid-cols-[160px_1fr_1fr_110px] gap-4 items-center px-6 py-3.5 ${idx < sorted.length - 1 ? 'border-b border-slate-50' : ''}`}
                      >
                        {/* Period label */}
                        <span className="text-sm font-medium text-gray-700">
                          {PERIOD_LABEL[row.billing_period] ?? row.billing_period}
                        </span>

                        {/* Price input */}
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-gray-400 shrink-0">R$</span>
                          <input
                            type="text"
                            value={edit.price}
                            onChange={e => setPriceEdits(prev => ({ ...prev, [row.id]: { ...edit, price: e.target.value } }))}
                            className="w-28 border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-mono text-gray-900 focus:outline-none focus:border-[#4ABCB1] focus:ring-2 focus:ring-[#4ABCB115]"
                          />
                        </div>

                        {/* Limit */}
                        <div className="flex items-center gap-3">
                          <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                            <input
                              type="checkbox"
                              checked={edit.unlimited}
                              onChange={e => setPriceEdits(prev => ({ ...prev, [row.id]: { ...edit, unlimited: e.target.checked } }))}
                              className="w-3.5 h-3.5 accent-[#4ABCB1]"
                            />
                            <span className="text-xs text-gray-500 select-none whitespace-nowrap">Ilimitado</span>
                          </label>
                          {edit.unlimited
                            ? <span className="text-xs text-emerald-600 font-semibold">∞</span>
                            : (
                              <input
                                type="text"
                                value={edit.limit}
                                onChange={e => setPriceEdits(prev => ({ ...prev, [row.id]: { ...edit, limit: e.target.value } }))}
                                placeholder="ex: 20"
                                className="w-20 border border-slate-200 rounded-xl px-3 py-1.5 text-sm font-mono text-gray-900 focus:outline-none focus:border-[#4ABCB1] focus:ring-2 focus:ring-[#4ABCB115]"
                              />
                            )
                          }
                        </div>

                        {/* Save button */}
                        <button
                          onClick={() => savePriceRow(row.id)}
                          disabled={isSaving}
                          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white transition-colors disabled:opacity-50 w-fit"
                          style={{ background: BRAND }}
                        >
                          {isSaving
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Save className="w-3.5 h-3.5" />
                          }
                          {isSaving ? 'Salvando' : 'Salvar'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Withdrawals table */}
      {activeTab === 'resgates' && (
        <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <p className="font-semibold text-gray-900">Solicitações de Resgate</p>
            <button onClick={loadWithdrawals} className="p-2 rounded-xl text-gray-400 hover:bg-slate-100 transition-colors">
              <RefreshCw className={`w-4 h-4 ${loadingWithdrawals ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {loadingWithdrawals ? (
            <div className="flex justify-center py-12">
              <div className="w-6 h-6 border-2 border-gray-200 border-t-[#4ABCB1] rounded-full animate-spin" />
            </div>
          ) : withdrawals.length === 0 ? (
            <div className="text-center py-12 text-gray-400 text-sm">Nenhuma solicitação de resgate.</div>
          ) : (
            <div className="divide-y divide-slate-50">
              {withdrawals.map(w => (
                <div key={w.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">
                      {w.profiles?.full_name ?? w.profiles?.email ?? w.user_id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-gray-400">Pix: {w.pix_key}</p>
                    <p className="text-xs text-gray-400">{new Date(w.requested_at).toLocaleDateString('pt-BR')}</p>
                  </div>
                  <p className="text-base font-bold text-gray-900">{formatCurrency(w.amount)}</p>
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    w.status === 'paid'     ? 'bg-emerald-50 text-emerald-600' :
                    w.status === 'rejected' ? 'bg-red-50 text-red-500' :
                    w.status === 'approved' ? 'bg-blue-50 text-blue-500' :
                                              'bg-amber-50 text-amber-600'
                  }`}>
                    {w.status === 'paid' ? 'Pago' : w.status === 'rejected' ? 'Rejeitado' : w.status === 'approved' ? 'Aprovado' : 'Pendente'}
                  </span>
                  {(w.status === 'pending' || w.status === 'approved') && (
                    <div className="flex gap-2">
                      {w.status === 'pending' && (
                        <button
                          onClick={() => updateWithdrawal(w.id, 'approved')}
                          className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors"
                        >
                          Aprovar
                        </button>
                      )}
                      <button
                        onClick={() => updateWithdrawal(w.id, 'paid')}
                        className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                      >
                        Marcar Pago
                      </button>
                      <button
                        onClick={() => updateWithdrawal(w.id, 'rejected')}
                        className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                      >
                        Rejeitar
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Side panel — Visualizar como */}
      {selectedCredor && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm flex items-center justify-end"
          onClick={e => { if (e.target === e.currentTarget) setSelectedCredor(null) }}
        >
          <div className="bg-white h-full w-full max-w-md shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 shrink-0">
              <div>
                <p className="text-xs text-gray-400 mb-0.5">Visualizando como</p>
                <h3 className="text-base font-semibold text-gray-900">
                  {selectedCredor.full_name ?? 'Credor'}
                </h3>
              </div>
              <button
                onClick={() => setSelectedCredor(null)}
                className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {loadingContracts ? (
                <div className="flex items-center justify-center py-12">
                  <div
                    className="w-6 h-6 border-2 rounded-full animate-spin"
                    style={{ borderColor: BRAND, borderTopColor: 'transparent' }}
                  />
                </div>
              ) : credorContracts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-2">
                  <p className="text-gray-400 text-sm">Nenhum contrato encontrado.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {credorContracts.map(c => (
                    <div key={c.id} className="flex items-center justify-between px-6 py-4">
                      <div>
                        <p className="text-sm font-semibold text-gray-900">
                          {c.clients?.name ?? '—'}
                        </p>
                        <p className="text-xs font-mono text-gray-400">{c.contract_number ?? '—'}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1.5">
                        <span className="text-sm font-semibold text-gray-900 tabular-nums">
                          {formatCurrency(c.total_amount)}
                        </span>
                        <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${STATUS_STYLE[c.status]}`}>
                          {STATUS_LABEL[c.status]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
