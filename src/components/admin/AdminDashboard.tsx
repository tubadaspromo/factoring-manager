import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  ArrowLeft, RefreshCw, Shield, Users, FileText,
  Crown, Lock, Search, Zap, Settings, Save, Loader2,
  CheckCircle2, AlertTriangle, Ban, Pencil,
} from 'lucide-react'
import { GerenciarCredorModal } from './GerenciarCredorModal'
import type { AdminCredor } from './GerenciarCredorModal'

const BRAND = '#4ABCB1'

interface AdminStats {
  total_users: number
  total_contracts: number
  total_capital: number
  premium_users: number
  free_users: number
  credores: AdminCredor[]
}

interface PlanSetting {
  id: string
  plan_name: string
  price: number
  contract_limit: number | null
  billing_period: string
}

type AdminTab      = 'credores' | 'configuracoes'
type StatusFilter  = 'all' | 'em_dia' | 'inadimplente'

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function planBadge(planName: string | null | undefined) {
  const p = (planName ?? 'free').toLowerCase()
  if (p === 'pro')     return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-amber-50 text-amber-600 shrink-0">🥇 Pro</span>
  if (p === 'starter') return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-600 shrink-0">🥈 Starter</span>
  return <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-xl bg-slate-100 text-slate-400 shrink-0"><Lock className="w-3 h-3" />Grátis</span>
}

function subStatusDot(status: string | null | undefined) {
  const s = (status ?? 'ativo').toLowerCase()
  if (s === 'bloqueado') return <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="Bloqueado" />
  if (s === 'pendente')  return <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" title="Pendente" />
  return <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Ativo" />
}

export function AdminDashboard({ onBack }: { onBack: () => void }) {
  const [stats, setStats]           = useState<AdminStats | null>(null)
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [selected, setSelected]       = useState<AdminCredor | null>(null)
  const [selectedTab, setSelectedTab] = useState<'detalhes' | 'editar'>('detalhes')
  const [toast, setToast]           = useState<{ msg: string; ok: boolean } | null>(null)
  const [activeTab, setActiveTab]   = useState<AdminTab>('credores')

  // Plan settings state
  const [planSettings, setPlanSettings]     = useState<PlanSetting[]>([])
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [editPrices, setEditPrices]         = useState<Record<string, string>>({})
  const [editLimits, setEditLimits]         = useState<Record<string, string>>({})
  const [editUnlimited, setEditUnlimited]   = useState<Record<string, boolean>>({})
  const [savingId, setSavingId]             = useState<string | null>(null)
  const [savedId, setSavedId]               = useState<string | null>(null)

  const PERIOD_LABEL: Record<string, string> = {
    monthly:    'Mensal',
    quarterly:  'Trimestral',
    semiannual: 'Semestral',
    annual:     'Anual',
  }

  useEffect(() => { loadStats() }, [])
  useEffect(() => { if (activeTab === 'configuracoes' && planSettings.length === 0) loadSettings() }, [activeTab])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  function showToast(msg: string, ok = true) { setToast({ msg, ok }) }

  async function loadStats() {
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_admin_stats')
      if (error) throw error
      setStats(data as AdminStats)
    } catch (e: any) {
      console.error('[AdminDashboard] loadStats error:', e)
    }
    setLoading(false)
  }

  async function loadSettings() {
    setLoadingSettings(true)
    try {
      const { data, error } = await (supabase.rpc as any)('get_system_settings')
      if (error) throw error
      const list = (data ?? []) as PlanSetting[]
      setPlanSettings(list)
      const prices: Record<string, string>    = {}
      const limits: Record<string, string>    = {}
      const unlimited: Record<string, boolean> = {}
      list.forEach((s: PlanSetting) => {
        prices[s.id]    = String(s.price)
        const isUnlimited = s.contract_limit == null || s.contract_limit >= 999999
        unlimited[s.id] = isUnlimited
        limits[s.id]    = isUnlimited ? '' : String(s.contract_limit)
      })
      setEditPrices(prices)
      setEditLimits(limits)
      setEditUnlimited(unlimited)
    } catch (e: any) {
      console.error('[AdminDashboard] loadSettings error:', e)
      showToast('Erro ao carregar configurações.', false)
    }
    setLoadingSettings(false)
  }

  async function saveSetting(row: PlanSetting) {
    setSavingId(row.id)
    const newPrice   = parseFloat(editPrices[row.id] ?? String(row.price))
    const isUnlimited = editUnlimited[row.id] ?? (row.contract_limit == null)
    const newLimit   = isUnlimited ? null : parseInt(editLimits[row.id] ?? String(row.contract_limit ?? 0), 10)
    try {
      const { error } = await (supabase.rpc as any)('admin_update_setting', {
        p_id:             row.id,
        p_price:          newPrice,
        p_contract_limit: newLimit,
      })
      if (error) throw error
      // Update local state so "Atual:" reflects the saved value immediately
      setPlanSettings(prev => prev.map(s =>
        s.id === row.id ? { ...s, price: newPrice, contract_limit: newLimit } : s
      ))
      setSavedId(row.id)
      setTimeout(() => setSavedId(null), 2500)
      showToast(`Plano ${row.plan_name} atualizado com sucesso!`)
    } catch (e: any) {
      console.error('[AdminDashboard] saveSetting error:', e)
      showToast(`Erro ao salvar: ${e?.message ?? 'Tente novamente.'}`, false)
    }
    setSavingId(null)
  }

  // Em Dia = ativo + not bloqueado; Inadimplente = bloqueado OR pendente
  const credores = (stats?.credores ?? []).filter(c => {
    const matchSearch = !search ||
      c.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.email.toLowerCase().includes(search.toLowerCase())

    const sub = (c.subscription_status ?? 'ativo').toLowerCase()
    const matchStatus =
      statusFilter === 'all'          ? true :
      statusFilter === 'em_dia'       ? (sub === 'ativo') :
      /* inadimplente */                (sub === 'bloqueado' || sub === 'pendente')

    return matchSearch && matchStatus
  })

  const inadimplenteCount = (stats?.credores ?? []).filter(c => {
    const sub = (c.subscription_status ?? 'ativo').toLowerCase()
    return sub === 'bloqueado' || sub === 'pendente'
  }).length

  // Estimated revenue = sum of plan prices × number of active subscribers
  const estimatedRevenue = planSettings.reduce((total, ps) => {
    const count = (stats?.credores ?? []).filter(c =>
      (c.plan_name ?? 'free').toLowerCase() === ps.plan_name.toLowerCase() &&
      (c.subscription_status ?? 'ativo') === 'ativo'
    ).length
    return total + ps.price * count
  }, 0)

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      {/* Header */}
      <header className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={onBack}
              className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 text-sm transition-colors px-2 py-2 rounded-xl hover:bg-slate-50"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <div className="h-5 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5" style={{ fill: BRAND, color: BRAND }} strokeWidth={0} />
              <span className="font-bold tracking-tight text-gray-900">Factoring</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Shield className="w-4 h-4 text-amber-500" />
              <span className="text-sm font-semibold text-amber-600">Painel Master</span>
            </div>
          </div>
          <button
            onClick={loadStats}
            disabled={loading}
            className="flex items-center gap-1.5 text-gray-500 text-sm font-medium px-3 py-2 rounded-xl border border-gray-200 hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-8">

        {/* Page title + tabs */}
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Visão Geral da Plataforma</h1>
          <p className="text-gray-400 text-sm mt-0.5">Gerencie todos os credores e seus planos</p>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-2xl w-fit mb-8">
          {([
            { id: 'credores',      label: 'Credores',             icon: <Users className="w-4 h-4" /> },
            { id: 'configuracoes', label: 'Configurações de Planos', icon: <Settings className="w-4 h-4" /> },
          ] as { id: AdminTab; label: string; icon: React.ReactNode }[]).map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === t.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        {/* Global metric cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <div className="rounded-3xl p-6 shadow-sm col-span-2 lg:col-span-1 relative overflow-hidden" style={{ background: BRAND }}>
            <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
            <p className="text-white/80 text-xs font-semibold uppercase tracking-wider mb-2">Capital Movimentado</p>
            <p className="text-white text-2xl font-bold leading-none tabular-nums">
              {loading ? '—' : fmt(stats?.total_capital ?? 0)}
            </p>
            <p className="text-white/60 text-xs mt-1.5">Saldo ativo na plataforma</p>
          </div>
          <MetricCard
            icon={<Users className="w-5 h-5 text-violet-500" />}
            label="Credores"
            value={loading ? '—' : String(stats?.total_users ?? 0)}
            sub={`${stats?.premium_users ?? 0} pagos · ${stats?.free_users ?? 0} grátis`}
            bg="#8B5CF615"
          />
          <MetricCard
            icon={<FileText className="w-5 h-5" style={{ color: BRAND }} />}
            label="Contratos"
            value={loading ? '—' : String(stats?.total_contracts ?? 0)}
            sub="Total na plataforma"
            bg="#4ABCB115"
          />
          <MetricCard
            icon={<Crown className="w-5 h-5 text-amber-500" />}
            label="Faturamento Est."
            value={loading ? '—' : fmt(estimatedRevenue)}
            sub={`${stats?.premium_users ?? 0} assinaturas ativas`}
            bg="#F59E0B15"
          />
        </div>

        {/* ── CREDORES TAB ── */}
        {activeTab === 'credores' && <>

          {/* Inadimplente alert banner */}
          {inadimplenteCount > 0 && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-2xl px-5 py-3.5 mb-5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-red-600 text-sm font-medium">
                {inadimplenteCount} credor{inadimplenteCount > 1 ? 'es' : ''} com assinatura pendente ou bloqueada.
              </p>
              <button
                onClick={() => setStatusFilter('inadimplente')}
                className="ml-auto text-xs font-bold text-red-500 hover:text-red-700 transition-colors"
              >
                Ver →
              </button>
            </div>
          )}

          {/* Search + filter bar */}
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por nome ou e-mail..."
                className="w-full bg-white border border-gray-200 rounded-2xl text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none focus:border-[#4ABCB1] focus:ring-4 focus:ring-[#4ABCB115] transition-all pl-10 pr-4 py-3"
              />
            </div>
            <div className="flex gap-2">
              {([
                { id: 'all',          label: 'Todos',        icon: null },
                { id: 'em_dia',       label: '✅ Em Dia',     icon: null },
                { id: 'inadimplente', label: '⚠ Inadimplente', icon: null },
              ] as { id: StatusFilter; label: string; icon: null }[]).map(f => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                    statusFilter === f.id ? 'text-white' : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                  style={statusFilter === f.id ? { background: f.id === 'inadimplente' ? '#EF4444' : BRAND } : {}}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Credores grid */}
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="bg-white rounded-3xl p-6 shadow-sm animate-pulse">
                  <div className="flex items-center gap-3 mb-5">
                    <div className="w-11 h-11 rounded-2xl bg-slate-100 shrink-0" />
                    <div className="flex flex-col gap-2 flex-1">
                      <div className="h-3.5 w-32 bg-slate-100 rounded-full" />
                      <div className="h-2.5 w-24 bg-slate-100 rounded-full" />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[1,2,3].map(j => <div key={j} className="h-14 bg-slate-100 rounded-2xl" />)}
                  </div>
                </div>
              ))}
            </div>
          ) : credores.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Users className="w-10 h-10 text-gray-200" />
              <p className="text-gray-400 text-sm">
                {search || statusFilter !== 'all' ? 'Nenhum credor encontrado neste filtro.' : 'Nenhum credor cadastrado ainda.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {credores.map(c => (
                <CredorCard
                  key={c.id}
                  creditor={c}
                  onManage={() => { setSelectedTab('detalhes'); setSelected(c) }}
                  onEdit={() => { setSelectedTab('editar'); setSelected(c) }}
                />
              ))}
            </div>
          )}
        </>}

        {/* ── CONFIGURAÇÕES DE PLANOS TAB ── */}
        {activeTab === 'configuracoes' && (
          <div className="max-w-2xl space-y-5">
            <p className="text-gray-400 text-sm">
              Defina os preços e limites de contratos por plano e período de cobrança.
            </p>

            {loadingSettings ? (
              <div className="flex flex-col gap-4">
                {[1, 2].map(i => (
                  <div key={i} className="bg-white rounded-3xl p-6 shadow-sm animate-pulse">
                    <div className="h-4 w-28 bg-slate-100 rounded-full mb-5" />
                    {[1,2,3,4].map(j => <div key={j} className="h-12 bg-slate-100 rounded-2xl mb-2" />)}
                  </div>
                ))}
              </div>
            ) : (
              (['starter', 'pro'] as const).map(planKey => {
                const rows = planSettings.filter(r => r.plan_name.toLowerCase() === planKey)
                if (rows.length === 0) return null

                const PERIOD_ORDER = ['monthly', 'quarterly', 'semiannual', 'annual']
                const sorted = [...rows].sort((a, b) =>
                  PERIOD_ORDER.indexOf(a.billing_period) - PERIOD_ORDER.indexOf(b.billing_period)
                )

                const planLabel = planKey === 'pro' ? '🥇 Plano Pro' : '🥈 Plano Starter'
                const planColor = planKey === 'pro' ? '#D97706' : '#6B7280'
                const planBg    = planKey === 'pro' ? '#FEF3C7' : '#F1F5F9'

                return (
                  <div key={planKey} className="bg-white rounded-3xl shadow-sm overflow-hidden">
                    {/* Plan header */}
                    <div className="px-6 py-4 border-b border-slate-100">
                      <span className="text-sm font-bold px-3 py-1.5 rounded-xl"
                        style={{ color: planColor, background: planBg }}>
                        {planLabel}
                      </span>
                    </div>

                    {/* Column labels */}
                    <div className="grid grid-cols-[160px_1fr_1fr_100px] gap-4 px-6 py-2 bg-slate-50 border-b border-slate-100">
                      {['Período', 'Preço (R$)', 'Limite de contratos', ''].map(h => (
                        <span key={h} className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{h}</span>
                      ))}
                    </div>

                    {/* Period rows */}
                    {sorted.map((row, idx) => {
                      const priceVal    = editPrices[row.id]    ?? String(row.price)
                      const limitVal    = editLimits[row.id]    ?? ''
                      const isUnlim     = editUnlimited[row.id] ?? (row.contract_limit == null || row.contract_limit >= 999999)
                      const isSaving    = savingId === row.id
                      const isSaved     = savedId  === row.id

                      return (
                        <div
                          key={row.id}
                          className={`grid grid-cols-[160px_1fr_1fr_100px] gap-4 items-center px-6 py-3.5 ${idx < sorted.length - 1 ? 'border-b border-slate-50' : ''}`}
                        >
                          {/* Period */}
                          <span className="text-sm font-medium text-gray-700">
                            {PERIOD_LABEL[row.billing_period] ?? row.billing_period}
                          </span>

                          {/* Price */}
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-gray-400 shrink-0">R$</span>
                            <input
                              type="number" min="0" step="0.01"
                              value={priceVal}
                              onChange={e => setEditPrices(prev => ({ ...prev, [row.id]: e.target.value }))}
                              className="w-28 border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-mono text-gray-900 focus:outline-none focus:border-[#4ABCB1] focus:ring-2 focus:ring-[#4ABCB115]"
                            />
                          </div>

                          {/* Limit */}
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 cursor-pointer shrink-0">
                              <input
                                type="checkbox"
                                checked={isUnlim}
                                onChange={e => setEditUnlimited(prev => ({ ...prev, [row.id]: e.target.checked }))}
                                className="w-3.5 h-3.5 accent-[#4ABCB1]"
                              />
                              <span className="text-xs text-gray-500 select-none">Ilimitado</span>
                            </label>
                            {isUnlim
                              ? <span className="text-xs text-emerald-600 font-semibold">∞</span>
                              : (
                                <input
                                  type="number" min="1"
                                  value={limitVal}
                                  onChange={e => setEditLimits(prev => ({ ...prev, [row.id]: e.target.value }))}
                                  placeholder="ex: 20"
                                  className="w-20 border border-gray-200 rounded-xl px-3 py-1.5 text-sm font-mono text-gray-900 focus:outline-none focus:border-[#4ABCB1] focus:ring-2 focus:ring-[#4ABCB115]"
                                />
                              )
                            }
                          </div>

                          {/* Save */}
                          <button
                            onClick={() => saveSetting(row)}
                            disabled={isSaving}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-all disabled:opacity-50 w-fit"
                            style={{ background: isSaved ? '#10b981' : BRAND }}
                          >
                            {isSaving
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : isSaved
                                ? <CheckCircle2 className="w-3.5 h-3.5" />
                                : <Save className="w-3.5 h-3.5" />}
                            {isSaved ? 'Salvo!' : isSaving ? '...' : 'Salvar'}
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

      </main>

      {/* Manage modal */}
      {selected && (
        <GerenciarCredorModal
          creditor={selected}
          onClose={() => setSelected(null)}
          onReload={loadStats}
          initialTab={selectedTab}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 text-white text-sm font-medium px-5 py-3.5 rounded-2xl shadow-lg ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
          {toast.ok
            ? <CheckCircle2 className="w-4 h-4 shrink-0" />
            : <AlertTriangle className="w-4 h-4 shrink-0" />}
          {toast.msg}
        </div>
      )}
    </div>
  )
}

// ─── Creditor Card ─────────────────────────────────────────────────────────────

function CredorCard({ creditor: c, onManage, onEdit }: { creditor: AdminCredor; onManage: () => void; onEdit: () => void }) {
  const sub = (c.subscription_status ?? 'ativo').toLowerCase()
  const isInadimplente = sub === 'bloqueado' || sub === 'pendente'

  return (
    <div className={`bg-white rounded-3xl p-6 shadow-sm flex flex-col gap-4 hover:shadow-md transition-shadow ${isInadimplente ? 'ring-1 ring-red-100' : ''}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative shrink-0">
            <div
              className="w-11 h-11 rounded-2xl flex items-center justify-center text-white text-base font-bold"
              style={{ background: BRAND + 'CC' }}
            >
              {(c.full_name ?? '?').charAt(0).toUpperCase()}
            </div>
            <span className="absolute -bottom-0.5 -right-0.5">{subStatusDot(c.subscription_status)}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{c.full_name ?? 'Sem nome'}</p>
            <p className="text-xs text-gray-400 truncate">{c.email}</p>
          </div>
        </div>
        {planBadge(c.plan_name)}
      </div>

      {/* Subscription status pill */}
      {isInadimplente && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold"
          style={{ background: sub === 'bloqueado' ? '#EF444415' : '#F59E0B15', color: sub === 'bloqueado' ? '#dc2626' : '#d97706' }}>
          {sub === 'bloqueado' ? <Ban className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
          {sub === 'bloqueado' ? 'Bloqueado' : 'Pendente'}
        </div>
      )}
      {!isInadimplente && sub === 'ativo' && c.plan_name && c.plan_name !== 'free' && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-600">
          <CheckCircle2 className="w-3.5 h-3.5" />Em dia
        </div>
      )}

      {/* Stats mini */}
      <div className="grid grid-cols-3 gap-2">
        <div className="flex flex-col items-center py-3 bg-slate-50 rounded-2xl">
          <span className="text-base font-bold text-gray-900">{c.active_count ?? c.contract_count}</span>
          <span className="text-[10px] text-gray-400 mt-0.5">Ativos</span>
        </div>
        <div className="flex flex-col items-center py-3 bg-slate-50 rounded-2xl">
          <span className="text-base font-bold text-gray-900">{c.client_count}</span>
          <span className="text-[10px] text-gray-400 mt-0.5">Clientes</span>
        </div>
        <div className="flex flex-col items-center py-3 bg-slate-50 rounded-2xl">
          <span className="text-[11px] font-bold tabular-nums" style={{ color: BRAND }}>
            {new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL' }).format(c.active_capital)}
          </span>
          <span className="text-[10px] text-gray-400 mt-0.5">Volume</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={onEdit}
          title="Editar dados do credor"
          className="flex items-center justify-center w-9 h-9 rounded-2xl border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 transition-all shrink-0"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onManage}
          className="flex-1 py-2.5 rounded-2xl text-white text-xs font-semibold transition-all active:scale-[0.98]"
          style={{ background: BRAND }}
          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.92)')}
          onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
        >
          Gerenciar
        </button>
      </div>
    </div>
  )
}

// ─── Metric Card ───────────────────────────────────────────────────────────────

function MetricCard({ icon, label, value, sub, bg }: {
  icon: React.ReactNode; label: string; value: string; sub: string; bg: string
}) {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm">
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ background: bg }}>
        {icon}
      </div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900 tabular-nums">{value}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  )
}
