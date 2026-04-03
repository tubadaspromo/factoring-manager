import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  X, Crown, Lock, Calendar, Phone, Mail, FileText,
  Users, Loader2, Eye, AlertTriangle, DollarSign, TrendingUp,
  Activity, CheckCircle2, Clock, Ban, Plus, Pencil, Save, User,
} from 'lucide-react'

const BRAND = '#4ABCB1'

type PlanStatus = 'free' | 'premium' | 'trial'
type Tab = 'detalhes' | 'planos' | 'contratos' | 'editar'
type SubStatus = 'ativo' | 'pendente' | 'bloqueado'
type PlanName  = 'free' | 'starter' | 'pro'

export interface AdminCredor {
  id: string
  full_name: string | null
  email: string
  phone: string | null
  plan_status: PlanStatus
  plan_name: string | null
  subscription_status: string | null
  subscription_expires_at: string | null
  plan_expires_at: string | null
  user_role: string
  created_at: string
  contract_count: number
  active_count: number
  active_capital: number
  client_count: number
  contract_limit: number
}

interface CredorContract {
  id: string
  contract_number: string | null
  total_amount: number
  total_interest: number
  status: string
  contract_date: string
  first_due_date: string | null
  archived: boolean
  client_name: string | null
}

interface Payment {
  id: string
  amount: number
  paid_at: string
  notes: string | null
}

function fmt(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

const STATUS_STYLE: Record<string, string> = {
  active:    'bg-blue-50 text-blue-500',
  overdue:   'bg-red-50 text-red-500',
  settled:   'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-slate-100 text-slate-400',
}
const STATUS_LABEL: Record<string, string> = {
  active: 'Pendente', overdue: 'Atrasado', settled: 'Pago', cancelled: 'Cancelado',
}

const SUB_STATUS_CONFIG: Record<SubStatus, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  ativo:     { label: 'Ativo',     color: '#16a34a', bg: '#22C55E15', icon: <CheckCircle2 className="w-4 h-4" /> },
  pendente:  { label: 'Pendente',  color: '#d97706', bg: '#F59E0B15', icon: <Clock        className="w-4 h-4" /> },
  bloqueado: { label: 'Bloqueado', color: '#dc2626', bg: '#EF444415', icon: <Ban          className="w-4 h-4" /> },
}

const PLAN_OPTIONS: { id: PlanName; label: string; badge: string; price: string; color: string }[] = [
  { id: 'free',    label: 'Gratuito', badge: '',   price: 'R$ 0',   color: '#64748B' },
  { id: 'starter', label: 'Starter',  badge: '🥈', price: 'R$ 49',  color: '#6B7280' },
  { id: 'pro',     label: 'Pro',      badge: '🥇', price: 'R$ 99',  color: '#D97706' },
]

function maskDocument(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 14)
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
  }
  return d
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
}

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2)  return `(${d}`
  if (d.length <= 7)  return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

export function GerenciarCredorModal({ creditor, onClose, onSetPlan: _onSetPlan, onReload, initialTab = 'detalhes' }: {
  creditor:    AdminCredor
  onClose:     () => void
  onSetPlan?:  (userId: string, plan: PlanStatus) => Promise<void>
  onReload:    () => void
  initialTab?: Tab
}) {
  const [tab, setTab] = useState<Tab>(initialTab)

  // Contracts
  const [contracts, setContracts]               = useState<CredorContract[]>([])
  const [loadingContracts, setLoadingContracts] = useState(false)

  // Subscription — initialize from creditor prop for instant display
  const [planName, setPlanName]             = useState<PlanName>(
    (['free','starter','pro'].includes(creditor.plan_name ?? '') ? creditor.plan_name as PlanName : 'free')
  )
  const [subStatus, setSubStatus]           = useState<SubStatus>('ativo')
  const [billingDue, setBillingDue]         = useState('')
  const [totalPaid, setTotalPaid]           = useState(0)
  const [loadingSub, setLoadingSub]         = useState(false)
  const [savingSub, setSavingSub]           = useState(false)
  const [subLoaded, setSubLoaded]           = useState(false)

  // Payments
  const [payments, setPayments]             = useState<Payment[]>([])
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [payAmount, setPayAmount]           = useState('')
  const [payDate, setPayDate]               = useState(new Date().toISOString().split('T')[0])
  const [payNotes, setPayNotes]             = useState('')
  const [savingPayment, setSavingPayment]   = useState(false)

  // Edit profile
  const [editName,      setEditName]        = useState(creditor.full_name ?? '')
  const [editPhone,     setEditPhone]       = useState(maskPhone(creditor.phone ?? ''))
  const [editDoc,       setEditDoc]         = useState('')
  const [editPlan,      setEditPlan]        = useState<PlanName>(
    (['free','starter','pro'].includes(creditor.plan_name ?? '') ? creditor.plan_name as PlanName : 'free')
  )
  const [editSubStatus, setEditSubStatus]   = useState<SubStatus>('ativo')
  const [loadingEdit,   setLoadingEdit]     = useState(false)
  const [savingEdit,    setSavingEdit]      = useState(false)
  const [editLoaded,    setEditLoaded]      = useState(false)
  const [editSaved,     setEditSaved]       = useState(false)

  // Impersonation
  const [impersonating, setImpersonating]   = useState(false)
  const [impContracts, setImpContracts]     = useState<CredorContract[]>([])
  const [impClients, setImpClients]         = useState<{ id: string; name: string; phone: string | null }[]>([])
  const [loadingImp, setLoadingImp]         = useState(false)

  // Load subscription when switching to planos tab or detalhes
  useEffect(() => {
    if (!subLoaded && (tab === 'planos' || tab === 'detalhes')) loadSubscription()
  }, [tab])

  useEffect(() => {
    if (tab === 'contratos' && contracts.length === 0) fetchContracts()
  }, [tab])

  useEffect(() => {
    if (tab === 'editar' && !editLoaded) loadEditProfile()
  }, [tab])

  async function loadSubscription() {
    setLoadingSub(true)
    const { data, error } = await (supabase.rpc as any)('admin_get_subscription', { p_user_id: creditor.id })
    if (error) { console.error('[loadSubscription]', error); setLoadingSub(false); return }
    const row = Array.isArray(data) ? data[0] : data
    if (row) {
      setPlanName((row.plan_name ?? 'free') as PlanName)
      setSubStatus((row.subscription_status ?? 'ativo') as SubStatus)
      setBillingDue(row.billing_due_date ?? '')
      setTotalPaid(Number(row.total_paid ?? 0))
    }
    setSubLoaded(true)
    setLoadingSub(false)
  }

  async function loadEditProfile() {
    setLoadingEdit(true)
    const { data, error } = await (supabase.rpc as any)('admin_get_profile', { p_user_id: creditor.id })
    if (error) { console.error('[loadEditProfile]', error); setLoadingEdit(false); return }
    const row = Array.isArray(data) ? data[0] : data
    if (row) {
      setEditName(row.full_name ?? '')
      setEditPhone(maskPhone(row.phone ?? ''))
      setEditDoc(row.document_number ? maskDocument(row.document_number) : '')
      setEditPlan((row.plan_name ?? 'free') as PlanName)
      setEditSubStatus((row.subscription_status ?? 'ativo') as SubStatus)
    }
    setEditLoaded(true)
    setLoadingEdit(false)
  }

  async function saveEdit() {
    if (!editName.trim()) return
    setSavingEdit(true)
    const { error } = await (supabase.rpc as any)('admin_update_profile', {
      p_user_id:             creditor.id,
      p_full_name:           editName.trim(),
      p_phone:               editPhone,
      p_document_number:     editDoc,
      p_document_type:       null,          // DB function derives it from length
      p_plan_name:           editPlan,
      p_subscription_status: editSubStatus,
    })
    if (!error) {
      setEditSaved(true)
      setTimeout(() => setEditSaved(false), 2500)
      onReload()
    } else {
      console.error('[saveEdit]', error)
    }
    setSavingEdit(false)
  }

  async function loadPayments() {
    setLoadingPayments(true)
    const { data, error } = await (supabase.rpc as any)('admin_get_payments', { p_user_id: creditor.id })
    if (error) console.error('[loadPayments]', error)
    setPayments((data ?? []) as Payment[])
    setLoadingPayments(false)
  }

  async function saveSubscription() {
    setSavingSub(true)
    // Update subscription details
    const { error: subErr } = await (supabase.rpc as any)('admin_update_subscription', {
      p_user_id:             creditor.id,
      p_plan_name:           planName,
      p_subscription_status: subStatus,
      p_billing_due_date:    billingDue || null,
    })
    if (subErr) console.error('[saveSubscription]', subErr)
    // Also update plan_name + plan_status via v2 for consistency
    await (supabase.rpc as any)('admin_set_plan_v2', {
      p_user_id:   creditor.id,
      p_plan_name: planName,
    })
    if (!subErr) onReload()
    setSavingSub(false)
  }

  async function addPayment() {
    const amount = parseFloat(payAmount.replace(/\./g, '').replace(',', '.'))
    if (!amount || amount <= 0) return
    setSavingPayment(true)
    const { error } = await (supabase.rpc as any)('admin_add_payment', {
      p_user_id: creditor.id,
      p_amount:  amount,
      p_paid_at: payDate,
      p_notes:   payNotes.trim() || null,
    })
    if (!error) {
      setTotalPaid(t => t + amount)
      setPayments(prev => [{ id: Date.now().toString(), amount, paid_at: payDate, notes: payNotes.trim() || null }, ...prev])
      setPayAmount(''); setPayNotes(''); setShowAddPayment(false)
    }
    setSavingPayment(false)
  }

  async function fetchContracts() {
    setLoadingContracts(true)
    const { data, error } = await (supabase.rpc as any)('admin_get_user_contracts', { p_user_id: creditor.id })
    if (error) console.error('[fetchContracts]', error)
    setContracts((data ?? []) as CredorContract[])
    setLoadingContracts(false)
  }

  async function startImpersonation() {
    setImpersonating(true)
    setLoadingImp(true)
    const [{ data: cts }, { data: cls }] = await Promise.all([
      (supabase.rpc as any)('admin_get_user_contracts', { p_user_id: creditor.id }),
      (supabase.from('clients') as any)
        .select('id, name, phone')
        .eq('user_id', creditor.id).is('deleted_at', null).order('name'),
    ])
    setImpContracts((cts ?? []) as CredorContract[])
    setImpClients((cls ?? []) as { id: string; name: string; phone: string | null }[])
    setLoadingImp(false)
  }

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'detalhes',  label: 'Detalhes',  icon: <Users    className="w-3.5 h-3.5" /> },
    { id: 'editar',    label: 'Editar',    icon: <Pencil   className="w-3.5 h-3.5" /> },
    { id: 'planos',    label: 'Planos',    icon: <Crown    className="w-3.5 h-3.5" /> },
    { id: 'contratos', label: 'Contratos', icon: <FileText className="w-3.5 h-3.5" /> },
  ]

  const subCfg = SUB_STATUS_CONFIG[subStatus]

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white w-full max-w-lg rounded-[32px] shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3.5">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center text-white text-lg font-bold shrink-0"
              style={{ background: BRAND }}
            >
              {(creditor.full_name ?? '?').charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-base font-semibold text-gray-900">{creditor.full_name ?? 'Sem nome'}</p>
              <div className="flex items-center gap-2 mt-0.5">
                {creditor.plan_status === 'premium' ? (
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600">
                    <Crown className="w-3 h-3" />Premium
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
                    <Lock className="w-3 h-3" />Grátis
                  </span>
                )}
                <span className="text-xs text-gray-400">{creditor.contract_count} contratos</span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-7 pt-4 shrink-0">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                tab === t.id ? 'text-white' : 'text-gray-500 hover:bg-slate-50'
              }`}
              style={tab === t.id ? { background: BRAND } : {}}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-7 py-5">

          {/* ── DETALHES ── */}
          {tab === 'detalhes' && (
            <div className="flex flex-col gap-4">
              <InfoRow icon={<Mail className="w-4 h-4 text-gray-400" />}     label="E-mail"       value={creditor.email} />
              <InfoRow icon={<Phone className="w-4 h-4 text-gray-400" />}    label="Telefone"     value={creditor.phone ?? '—'} />
              <InfoRow icon={<Calendar className="w-4 h-4 text-gray-400" />} label="Membro desde" value={fmtDate(creditor.created_at.split('T')[0])} />
              <div className="h-px bg-slate-100" />
              <div className="grid grid-cols-3 gap-3">
                <StatMini label="Contratos"    value={String(creditor.contract_count)} />
                <StatMini label="Clientes"     value={String(creditor.client_count)} />
                <StatMini label="Capital Ativo" value={fmt(creditor.active_capital)} small />
              </div>

              {/* Total Pago em mensalidades */}
              {loadingSub ? null : (
                <div className="flex items-center gap-3 p-4 rounded-2xl" style={{ background: '#22C55E10', border: '1px solid #22C55E20' }}>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: '#22C55E15' }}>
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Total Pago em Mensalidades</p>
                    <p className="text-lg font-bold tabular-nums" style={{ color: '#16a34a' }}>{fmt(totalPaid)}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── EDITAR ── */}
          {tab === 'editar' && (
            loadingEdit ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: BRAND }} />
              </div>
            ) : (
              <div className="flex flex-col gap-4">

                {/* Nome */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Nome completo</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="text"
                      value={editName}
                      onChange={e => setEditName(e.target.value)}
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-2xl text-sm text-gray-900 focus:outline-none focus:border-[#4ABCB1] focus:ring-4 focus:ring-[#4ABCB115] transition-all"
                      placeholder="Nome completo"
                    />
                  </div>
                </div>

                {/* E-mail (readonly) */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300 pointer-events-none" />
                    <input
                      type="text"
                      value={creditor.email}
                      readOnly
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-100 rounded-2xl text-sm text-gray-400 bg-slate-50 cursor-not-allowed"
                    />
                  </div>
                </div>

                {/* Telefone */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Telefone / WhatsApp</label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="tel"
                      value={editPhone}
                      onChange={e => setEditPhone(maskPhone(e.target.value))}
                      placeholder="(11) 99999-9999"
                      className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-2xl text-sm text-gray-900 focus:outline-none focus:border-[#4ABCB1] focus:ring-4 focus:ring-[#4ABCB115] transition-all"
                    />
                  </div>
                </div>

                {/* CPF / CNPJ */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5" />CPF / CNPJ
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editDoc}
                    onChange={e => setEditDoc(maskDocument(e.target.value))}
                    placeholder="000.000.000-00 ou 00.000.000/0000-00"
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-2xl text-sm text-gray-900 font-mono focus:outline-none focus:border-[#4ABCB1] focus:ring-4 focus:ring-[#4ABCB115] transition-all"
                  />
                  <p className="text-[11px] text-gray-400 pl-1">
                    Salvo sem pontuação no banco. Usado na geração do Pix.
                  </p>
                </div>

                <div className="h-px bg-slate-100" />

                {/* Plano */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Plano</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PLAN_OPTIONS.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setEditPlan(p.id)}
                        className={`flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border-2 transition-all ${
                          editPlan === p.id ? 'border-transparent' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                        }`}
                        style={editPlan === p.id ? { background: p.color + '15', borderColor: p.color + '60' } : {}}
                      >
                        <span className="text-base leading-none">{p.badge || '🆓'}</span>
                        <span className="text-xs font-bold" style={{ color: editPlan === p.id ? p.color : '#64748B' }}>
                          {p.label}
                        </span>
                        <span className="text-[10px] text-gray-400">{p.price}/mês</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Status da assinatura */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status da Assinatura</label>
                  <div className="flex gap-2">
                    {(Object.entries(SUB_STATUS_CONFIG) as [SubStatus, typeof SUB_STATUS_CONFIG[SubStatus]][]).map(([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() => setEditSubStatus(key)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border-2 text-xs font-semibold transition-all"
                        style={editSubStatus === key
                          ? { background: cfg.bg, borderColor: cfg.color + '50', color: cfg.color }
                          : { borderColor: '#E2E8F0', color: '#94A3B8' }
                        }
                      >
                        {cfg.icon}{cfg.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Save */}
                <button
                  onClick={saveEdit}
                  disabled={savingEdit || !editName.trim()}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-sm font-semibold disabled:opacity-50 transition-all active:scale-[0.98]"
                  style={{ background: editSaved ? '#10b981' : BRAND }}
                >
                  {savingEdit
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : editSaved
                      ? <CheckCircle2 className="w-4 h-4" />
                      : <Save className="w-4 h-4" />}
                  {editSaved ? 'Salvo!' : 'Salvar Alterações'}
                </button>
              </div>
            )
          )}

          {/* ── PLANOS ── */}
          {tab === 'planos' && (
            loadingSub ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: BRAND }} />
              </div>
            ) : (
              <div className="flex flex-col gap-5">

                {/* Plan selector */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Plano</p>
                  <div className="grid grid-cols-3 gap-2">
                    {PLAN_OPTIONS.map(p => (
                      <button
                        key={p.id}
                        onClick={() => setPlanName(p.id)}
                        className={`flex flex-col items-center gap-1 py-3 px-2 rounded-2xl border-2 transition-all ${
                          planName === p.id ? 'border-transparent' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                        }`}
                        style={planName === p.id ? { background: p.color + '15', borderColor: p.color + '60' } : {}}
                      >
                        <span className="text-base leading-none">{p.badge || '🆓'}</span>
                        <span className="text-xs font-bold" style={{ color: planName === p.id ? p.color : '#64748B' }}>
                          {p.label}
                        </span>
                        <span className="text-[10px] text-gray-400">{p.price}/mês</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Subscription status */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Status da Assinatura</p>
                  <div className="flex gap-2">
                    {(Object.entries(SUB_STATUS_CONFIG) as [SubStatus, typeof SUB_STATUS_CONFIG[SubStatus]][]).map(([key, cfg]) => (
                      <button
                        key={key}
                        onClick={() => setSubStatus(key)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border-2 text-xs font-semibold transition-all`}
                        style={subStatus === key
                          ? { background: cfg.bg, borderColor: cfg.color + '50', color: cfg.color }
                          : { borderColor: '#E2E8F0', color: '#94A3B8' }
                        }
                      >
                        {cfg.icon}{cfg.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Billing due date */}
                <div>
                  <p className="text-xs font-semibold text-gray-500 mb-2">Vencimento da Mensalidade</p>
                  <div className="relative">
                    <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="date"
                      value={billingDue}
                      onChange={e => setBillingDue(e.target.value)}
                      className="w-full bg-white border border-gray-200 rounded-2xl text-gray-900 text-sm focus:outline-none focus:border-[#4ABCB1] focus:ring-4 focus:ring-[#4ABCB115] transition-all pl-10 pr-4 py-3"
                    />
                  </div>
                  {billingDue && (() => {
                    const days = Math.ceil((new Date(billingDue).getTime() - Date.now()) / 86_400_000)
                    const color = days < 0 ? '#EF4444' : days <= 7 ? '#F59E0B' : '#22C55E'
                    const label = days < 0 ? `Venceu há ${Math.abs(days)}d` : days === 0 ? 'Vence hoje' : `Vence em ${days}d`
                    return <p className="text-xs font-semibold mt-1.5 ml-1" style={{ color }}>{label}</p>
                  })()}
                </div>

                {/* Save button */}
                <button
                  onClick={saveSubscription}
                  disabled={savingSub}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl text-white text-sm font-semibold disabled:opacity-50 transition-all active:scale-[0.98]"
                  style={{ background: BRAND }}
                  onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.92)')}
                  onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
                >
                  {savingSub ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Salvar Configurações
                </button>

                {/* Status badge preview */}
                <div className="flex items-center gap-2 px-4 py-3 rounded-2xl" style={{ background: subCfg.bg }}>
                  <span style={{ color: subCfg.color }}>{subCfg.icon}</span>
                  <p className="text-xs font-semibold" style={{ color: subCfg.color }}>
                    {subStatus === 'bloqueado'
                      ? 'Credor bloqueado — não pode criar contratos nem acessar clientes'
                      : subStatus === 'pendente'
                        ? 'Credor com pagamento pendente — ainda tem acesso'
                        : 'Credor com assinatura ativa'}
                  </p>
                </div>

                <div className="h-px bg-slate-100" />

                {/* Payment history */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-gray-500">Histórico de Pagamentos</p>
                    <button
                      onClick={() => { setShowAddPayment(v => !v); if (payments.length === 0) loadPayments() }}
                      className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl transition-colors"
                      style={{ background: BRAND + '15', color: BRAND }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Registrar
                    </button>
                  </div>

                  {/* Add payment form */}
                  {showAddPayment && (
                    <div className="bg-slate-50 rounded-2xl p-4 mb-3 flex flex-col gap-3">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 mb-1">Valor (R$)</p>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={payAmount}
                            onChange={e => setPayAmount(e.target.value)}
                            placeholder="0,00"
                            className="w-full bg-white border border-gray-200 rounded-xl text-sm text-gray-900 px-3 py-2 focus:outline-none focus:border-[#4ABCB1] transition-all"
                          />
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-gray-400 mb-1">Data</p>
                          <input
                            type="date"
                            value={payDate}
                            onChange={e => setPayDate(e.target.value)}
                            className="w-full bg-white border border-gray-200 rounded-xl text-sm text-gray-900 px-3 py-2 focus:outline-none focus:border-[#4ABCB1] transition-all"
                          />
                        </div>
                      </div>
                      <input
                        type="text"
                        value={payNotes}
                        onChange={e => setPayNotes(e.target.value)}
                        placeholder="Observação (opcional)"
                        className="w-full bg-white border border-gray-200 rounded-xl text-sm text-gray-900 px-3 py-2 focus:outline-none focus:border-[#4ABCB1] transition-all"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowAddPayment(false)}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold text-gray-500 border border-gray-200 hover:bg-slate-100 transition-colors"
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={addPayment}
                          disabled={savingPayment || !payAmount}
                          className="flex-1 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50 transition-all"
                          style={{ background: BRAND }}
                        >
                          {savingPayment ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Confirmar'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Payment list */}
                  {loadingPayments ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-5 h-5 animate-spin text-gray-300" />
                    </div>
                  ) : payments.length === 0 && !showAddPayment ? (
                    <button
                      onClick={() => { loadPayments(); setShowAddPayment(false) }}
                      className="w-full text-center text-xs text-gray-400 hover:text-gray-600 py-3 transition-colors"
                    >
                      Ver histórico de pagamentos →
                    </button>
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {payments.map(p => (
                        <div key={p.id} className="flex items-center justify-between px-3.5 py-2.5 bg-slate-50 rounded-xl">
                          <div>
                            <p className="text-sm font-semibold tabular-nums" style={{ color: '#16a34a' }}>{fmt(p.amount)}</p>
                            {p.notes && <p className="text-[11px] text-gray-400">{p.notes}</p>}
                          </div>
                          <p className="text-xs text-gray-400">{fmtDate(p.paid_at)}</p>
                        </div>
                      ))}
                      {payments.length === 0 && <p className="text-xs text-gray-400 text-center py-2">Nenhum pagamento registrado.</p>}
                    </div>
                  )}
                </div>
              </div>
            )
          )}

          {/* ── CONTRATOS ── */}
          {tab === 'contratos' && (
            loadingContracts ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: BRAND }} />
              </div>
            ) : contracts.length === 0 ? (
              <div className="flex flex-col items-center py-12 gap-2 text-center">
                <FileText className="w-8 h-8 text-gray-200" />
                <p className="text-gray-400 text-sm">Nenhum contrato encontrado.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4">

                {/* ── Resumo de Performance ── */}
                {(() => {
                  const totalEmprestado = contracts.reduce((s, c) => s + Math.max(0, c.total_amount - c.total_interest), 0)
                  const lucroBruto      = contracts.filter(c => c.status === 'settled').reduce((s, c) => s + c.total_interest, 0)
                  const ativos          = contracts.filter(c => !c.archived).length
                  return (
                    <div className="grid grid-cols-3 gap-2">
                      <PerfCard icon={<DollarSign className="w-4 h-4" style={{ color: BRAND }} />} bg={BRAND + '15'} label="Total Emprestado" value={fmt(totalEmprestado)} sub="Capital (principal)" />
                      <PerfCard icon={<TrendingUp className="w-4 h-4 text-emerald-500" />} bg="#22C55E15" label="Lucro Realizado" value={fmt(lucroBruto)} sub="Juros recebidos" valueColor="#16a34a" />
                      <PerfCard icon={<Activity className="w-4 h-4 text-violet-500" />} bg="#8B5CF615" label="Contratos Ativos" value={String(ativos)} sub="Não arquivados" />
                    </div>
                  )
                })()}

                {/* ── Lista de Contratos ── */}
                <div className="flex flex-col gap-2">
                  {contracts.map(c => {
                    const isPaidOrArchived = c.status === 'settled' || c.archived
                    const accentColor = isPaidOrArchived ? '#22C55E'
                      : c.status === 'overdue' ? '#EF4444'
                      : BRAND
                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors border-l-[3px]"
                        style={{ borderLeftColor: accentColor, opacity: isPaidOrArchived ? 0.7 : 1 }}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 truncate">{c.client_name ?? '—'}</p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {c.contract_date ? fmtDate(c.contract_date) : '—'}
                            {c.first_due_date ? ` · vence ${fmtDate(c.first_due_date)}` : ''}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
                          <span className="text-sm font-semibold text-gray-900 tabular-nums">{fmt(c.total_amount)}</span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status] ?? 'bg-slate-100 text-slate-400'}`}>
                            {STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          )}
        </div>

        {/* Footer */}
        <div className="px-7 pb-6 pt-3 border-t border-slate-100 shrink-0">
          <button
            onClick={startImpersonation}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl text-sm font-semibold border-2 transition-all hover:opacity-80 active:scale-[0.98]"
            style={{ borderColor: BRAND, color: BRAND }}
          >
            <Eye className="w-4 h-4" />
            Ver como {creditor.full_name?.split(' ')[0] ?? 'Credor'}
          </button>
        </div>
      </div>

      {/* ── Overlay de Impersonação ── */}
      {impersonating && (
        <div className="fixed inset-0 z-[60] bg-white flex flex-col">
          <div className="bg-amber-400 px-6 py-3 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-900" />
              <p className="text-amber-900 text-sm font-semibold">
                Modo Visualização — dados de <strong>{creditor.full_name}</strong>. Nenhuma alteração é feita.
              </p>
            </div>
            <button
              onClick={() => setImpersonating(false)}
              className="flex items-center gap-1.5 text-amber-900 text-xs font-bold px-3 py-1.5 bg-amber-200 rounded-xl hover:bg-amber-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />Sair
            </button>
          </div>

          <div className="flex-1 overflow-y-auto bg-slate-50">
            {loadingImp ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 animate-spin" style={{ color: BRAND }} />
              </div>
            ) : (
              <div className="max-w-4xl mx-auto px-6 py-8 flex flex-col gap-6">
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: 'Contratos', value: impContracts.length },
                    { label: 'Clientes',  value: impClients.length },
                  ].map(s => (
                    <div key={s.label} className="bg-white rounded-3xl p-5 shadow-sm text-center">
                      <p className="text-2xl font-bold text-gray-900">{s.value}</p>
                      <p className="text-xs text-gray-400 mt-1">{s.label}</p>
                    </div>
                  ))}
                  <div className="bg-white rounded-3xl p-5 shadow-sm text-center">
                    <p className="text-lg font-bold tabular-nums" style={{ color: BRAND }}>
                      {fmt(impContracts.filter(c => c.status === 'active' || c.status === 'overdue').reduce((s, c) => s + c.total_amount, 0))}
                    </p>
                    <p className="text-xs text-gray-400 mt-1">Capital Ativo</p>
                  </div>
                </div>

                {/* Contracts */}
                <div className="bg-white rounded-[32px] shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <FileText className="w-4 h-4" style={{ color: BRAND }} />
                      Contratos ({impContracts.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {impContracts.map(c => (
                      <div key={c.id} className="flex items-center justify-between px-6 py-3.5">
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{c.client_name ?? '—'}</p>
                          <p className="text-xs font-mono text-gray-400">{c.contract_number ?? '—'}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm font-semibold tabular-nums text-gray-900">{fmt(c.total_amount)}</span>
                          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[c.status] ?? ''}`}>
                            {STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </div>
                      </div>
                    ))}
                    {impContracts.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Sem contratos.</p>}
                  </div>
                </div>

                {/* Clients */}
                <div className="bg-white rounded-[32px] shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <Users className="w-4 h-4" style={{ color: BRAND }} />
                      Clientes ({impClients.length})
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {impClients.map(cl => (
                      <div key={cl.id} className="flex items-center justify-between px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-semibold" style={{ background: BRAND + 'CC' }}>
                            {cl.name.charAt(0).toUpperCase()}
                          </div>
                          <p className="text-sm font-semibold text-gray-900">{cl.name}</p>
                        </div>
                        <span className="text-xs text-gray-400">{cl.phone ?? '—'}</span>
                      </div>
                    ))}
                    {impClients.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Sem clientes.</p>}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">{icon}</div>
      <div>
        <p className="text-[11px] text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-gray-800">{value}</p>
      </div>
    </div>
  )
}

function StatMini({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="bg-slate-50 rounded-2xl p-3.5 text-center">
      <p className={`font-bold text-gray-900 tabular-nums ${small ? 'text-sm' : 'text-xl'}`}>{value}</p>
      <p className="text-[11px] text-gray-400 mt-0.5">{label}</p>
    </div>
  )
}

function PerfCard({ icon, bg, label, value, sub, valueColor }: {
  icon: React.ReactNode; bg: string; label: string; value: string; sub: string; valueColor?: string
}) {
  return (
    <div className="bg-white border border-slate-100 rounded-2xl p-3.5 flex flex-col gap-2">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
        {icon}
      </div>
      <div>
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider leading-none mb-1">{label}</p>
        <p className="text-sm font-bold tabular-nums text-gray-900 leading-tight" style={valueColor ? { color: valueColor } : {}}>
          {value}
        </p>
        <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>
      </div>
    </div>
  )
}
