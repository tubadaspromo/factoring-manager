import { useEffect, useRef, useState } from 'react'
import jsPDF from 'jspdf'
import { createPortal } from 'react-dom'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie,
} from 'recharts'
import { supabase } from '@/lib/supabase'
import {
  LayoutDashboard, FileText, Users, Settings,
  LogOut, Plus, TrendingUp, Wallet, AlertCircle,
  Zap, RefreshCw, X, Loader2,
  DollarSign, Percent, Calendar, Search, CheckCircle2,
  Phone, UserPlus, Paperclip, StickyNote, Clock,
  Hash, Repeat, Info, CheckCheck, BarChart2, History,
  Shield, Lock, Trash2, MoreHorizontal, MoreVertical, Pencil, MapPin,
  FileText as FileTextIcon, Upload, File as FileIcon, Inbox, Menu, ChevronRight,
  FileDown, ArrowUpCircle, ArrowDownCircle, Receipt, Download, ChevronDown,
  ExternalLink, Layers, Gift, Copy,
} from 'lucide-react'
import { UpgradeModal }     from '@/components/UpgradeModal'
import { DailyAlerts }      from '@/components/DailyAlerts'
import { MasterAdmin }       from '@/components/MasterAdmin'
import { EditProfileModal }  from '@/components/EditProfileModal'
import type { ProfileData }  from '@/components/EditProfileModal'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Metrics {
  capitalExposto:  number   // principal lançado (sem juros)
  aReceber:        number   // principal + juros a receber
  contratosAtivos: number   // active + overdue
  clientesTotal:   number
}

interface RecentContract {
  id: string
  client_id: string
  client_name: string
  client_phone: string | null
  client_score: string
  total_amount: number
  total_interest: number
  paid_amount: number
  status: 'active' | 'overdue' | 'settled' | 'cancelled'
  contract_date: string
  first_due_date: string | null
  payment_type: string
  installments: number
  contract_number: string | null
  archived: boolean
}

type PlanStatus = 'free' | 'premium' | 'trial'
type PlanName   = 'free' | 'starter' | 'pro'

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

interface Client {
  id: string
  name: string
  nickname: string | null
  score?: string | null
}

interface ClientWithStats {
  id: string
  name: string
  phone: string | null
  score: string
  contract_count: number
  total_balance: number
}

interface ClientDetailContract {
  id: string
  contract_number: string | null
  total_amount: number
  total_interest: number
  status: string
  archived: boolean
  contract_date: string
  first_due_date: string | null
  installments: number
  payment_type: string
}


interface MonthlyProfit {
  month: string
  value: number
}

interface Movimentacao {
  id: string
  tipo: 'entrada' | 'saida'
  client_name: string
  contract_number: string | null
  valor: number
  data: string
  descricao: string
  observacoes?: string
  manual?: boolean
}

interface NextInstallment {
  id: string
  client_name: string
  due_date: string
  amount: number
}

type NavPage = 'inicio' | 'contratos' | 'clientes' | 'contas' | 'movimentacoes' | 'relatorios' | 'afiliados' | 'configuracoes' | 'master'
type ContractFilter = 'all' | 'active' | 'overdue' | 'archived'

const BRAND = '#4ABCB1'
const MONTHLY_GOAL = 5_000 // Meta de Lucro Mensal em R$

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function formatDate(dateStr: string) {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function formatCurrencyInput(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (!digits) return ''
  const value = parseInt(digits, 10) / 100
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseCurrencyInput(formatted: string): number {
  return parseFloat(formatted.replace(/\./g, '').replace(',', '.')) || 0
}

// Máscara CPF/CNPJ automática
function maskCpfCnpj(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 14)
  if (digits.length <= 11) {
    if (digits.length <= 3) return digits
    if (digits.length <= 6) return `${digits.slice(0,3)}.${digits.slice(3)}`
    if (digits.length <= 9) return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6)}`
    return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`
  }
  if (digits.length <= 2) return digits
  if (digits.length <= 5) return `${digits.slice(0,2)}.${digits.slice(2)}`
  if (digits.length <= 8) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5)}`
  if (digits.length <= 12) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8)}`
  return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12)}`
}

// Normaliza qualquer formato de telefone para (99) 99999-9999
function formatPhoneDisplay(raw: string | null | undefined): string {
  if (!raw) return ''
  const digits = raw.replace(/\D/g, '').slice(0, 11)
  if (digits.length < 10) return raw  // não reconhecível — retorna como está
  if (digits.length === 10) return `(${digits.slice(0,2)}) ${digits.slice(2,6)}-${digits.slice(6)}`
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
}

// Máscara de entrada de telefone para inputs
function maskPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`
  return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`
}

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Bom dia'
  if (h < 18) return 'Boa tarde'
  return 'Boa noite'
}

function todayFormatted() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

// ─── Score do cliente ─────────────────────────────────────────────────────────
const SCORE_LABEL: Record<string, string> = {
  bom_pagador: 'Bom pagador',
  neutro:      'Neutro',
  mal_pagador: 'Mal pagador',
}
const SCORE_COLOR: Record<string, string> = {
  bom_pagador: '#16a34a',
  neutro:      '#64748b',
  mal_pagador: '#dc2626',
}

const STATUS_LABEL: Record<string, string> = {
  active:    'A Receber',
  overdue:   'Atrasado',
  settled:   'Pago',
  cancelled: 'Cancelado',
}

function getStatusLabel(status: string, firstDueDate: string | null): string {
  if (status === 'active') {
    return isOverdue(firstDueDate, status) ? 'Vencido' : 'A Receber'
  }
  return STATUS_LABEL[status] ?? status
}

const STATUS_STYLE: Record<string, string> = {
  active:    'bg-blue-50 text-blue-500',
  overdue:   'bg-red-100 text-red-600',
  settled:   'bg-emerald-50 text-emerald-600',
  cancelled: 'bg-slate-100 text-slate-400',
}

function getStatusStyle(status: string, firstDueDate: string | null): string {
  if (status === 'active' && isOverdue(firstDueDate, status)) return 'bg-red-100 text-red-600'
  return STATUS_STYLE[status] ?? 'bg-slate-100 text-slate-400'
}

// classes compartilhadas dos inputs
const inputCls =
  'w-full bg-white border border-gray-200 rounded-2xl text-gray-900 text-sm placeholder:text-gray-400 ' +
  'focus:outline-none focus:border-[#4ABCB1] focus:ring-4 focus:ring-[#4ABCB115] transition-all'

// ─── Dashboard principal ──────────────────────────────────────────────────────

export function Dashboard({ userRole: roleFromApp, onGoAdmin }: {
  userRole?: 'user' | 'admin'
  onGoAdmin?: () => void
} = {}) {
  const [activePage, setActivePage]       = useState<NavPage>(() => {
    const hash = window.location.hash.replace('#', '') as NavPage
    const valid: NavPage[] = ['inicio', 'contratos', 'clientes', 'contas', 'movimentacoes', 'relatorios', 'configuracoes']
    return valid.includes(hash) ? hash : 'inicio'
  })
  const [metrics, setMetrics]             = useState<Metrics | null>(null)
  const [contracts, setContracts]         = useState<RecentContract[]>([])
  const [archivedList, setArchivedList]   = useState<RecentContract[]>([])
  const [loadingArchived, setLoadingArchived] = useState(false)
  const [userName, setUserName]           = useState<string>('')
  const [loading, setLoading]             = useState(true)
  const [error, setError]                 = useState<string | null>(null)
  const [showModal, setShowModal]         = useState(false)
  const [toast, setToast]                 = useState<string | null>(null)
  const [filter, setFilter]               = useState<ContractFilter>('all')
  const [contractSearch, setContractSearch] = useState('')
  const [contractDateFrom, setContractDateFrom] = useState('')
  const [contractDateTo, setContractDateTo]     = useState('')
  const [clientFilter, setClientFilter]   = useState<{ id: string; name: string } | null>(null)

  // Clientes tab
  const [clientsData, setClientsData]         = useState<ClientWithStats[]>([])
  const [loadingClients, setLoadingClients]   = useState(false)
  const [clientSearch, setClientSearch]       = useState('')

  // Relatórios tab
  const [monthlyProfits, setMonthlyProfits]     = useState<MonthlyProfit[]>([])
  const [totalProfit, setTotalProfit]           = useState(0)
  const [nextInstallments, setNextInstallments] = useState<NextInstallment[]>([])
  const [settledContracts, setSettledContracts] = useState<{ id: string; total_amount: number; total_interest: number; created_at: string; client_name?: string }[]>([])
  const [loadingReports, setLoadingReports]     = useState(false)
  const [monthlyGoal, setMonthlyGoal]           = useState(MONTHLY_GOAL)
  const [savingGoal, setSavingGoal]             = useState(false)

  // Movimentações tab
  const [movimentacoes, setMovimentacoes]       = useState<Movimentacao[]>([])
  const [loadingMovimentacoes, setLoadingMovimentacoes] = useState(false)

  // SaaS: plan + role
  // roleFromApp comes from App.tsx (loaded before Dashboard mounts); keep in sync
  const [planName, setPlanName]             = useState<PlanName>('free')
  const [userRole, setUserRole]             = useState<'user' | 'admin'>(roleFromApp ?? 'user')
  const [subscriptionStatus, setSubscriptionStatus] = useState<'ativo' | 'pendente' | 'bloqueado'>('ativo')
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState<string | null>(null)
  // Limite vindo do banco (system_settings join via get_user_subscription); 3 enquanto carrega
  const [contractLimitFromDB, setContractLimitFromDB] = useState<number>(3)

  useEffect(() => {
    if (roleFromApp) setUserRole(roleFromApp)
  }, [roleFromApp])
  const [showUpgradeModal, setShowUpgradeModal]   = useState(false)
  const [showProfileModal, setShowProfileModal]   = useState(false)
  const [profileData,      setProfileData]        = useState<ProfileData | null>(null)

  // Sidebar mobile
  const [sidebarOpen, setSidebarOpen] = useState(false)

  // Admin panel
  const [adminStats, setAdminStats]         = useState<AdminStats | null>(null)
  const [loadingAdmin, setLoadingAdmin]     = useState(false)

  useEffect(() => { loadDashboard() }, [])

  useEffect(() => {
    if (activePage === 'clientes')                                      loadClientsPage()
    if (activePage === 'relatorios' && monthlyProfits.length === 0)    loadReports()
    if (activePage === 'movimentacoes' && movimentacoes.length === 0)  loadMovimentacoes()
    if (activePage === 'master'     && !adminStats)                 loadAdminStats()
    if (activePage === 'contratos'  && archivedList.length === 0)   loadArchivedContracts()
    if (activePage === 'configuracoes')                              refreshSubscription()
  }, [activePage])

  // Re-fetch status real do banco ao abrir a aba Assinatura (evita status fantasma)
  async function refreshSubscription() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [{ data: profile }, { data: subData }] = await Promise.all([
        (supabase.from('profiles') as any)
          .select('plan_status, plan_name, subscription_status, subscription_expires_at')
          .eq('id', user.id)
          .single(),
        (supabase.rpc as any)('get_user_subscription'),
      ])
      if (profile) {
        setPlanName((profile.plan_name ?? 'free') as PlanName)
        setSubscriptionStatus(profile.subscription_status ?? 'ativo')
        setSubscriptionExpiresAt(profile.subscription_expires_at ?? null)
      }
      if (subData?.contract_limit != null) {
        setContractLimitFromDB(Number(subData.contract_limit))
      }
    } catch (e) {
      console.error('[refreshSubscription]', e)
    }
  }

  useEffect(() => {
    if (filter === 'archived' && archivedList.length === 0) loadArchivedContracts()
  }, [filter])

  // Sync tab ↔ URL hash (F5 persistence)
  useEffect(() => {
    window.location.hash = activePage
  }, [activePage])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  async function loadDashboard() {
    setLoading(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'usuário'
      setUserName(capitalize(name))

      // Load profile (plan + role) — upsert if missing (first login before trigger ran)
      const { data: profile } = await (supabase.from('profiles') as any)
        .select('plan_status, plan_name, user_role, monthly_goal, subscription_status, subscription_expires_at, document_number, document_type, phone, full_name')
        .eq('id', user!.id)
        .single()
      if (profile) {
        setPlanName((profile.plan_name ?? 'free') as PlanName)
        setUserRole(profile.user_role ?? 'user')
        if (profile.monthly_goal != null) setMonthlyGoal(profile.monthly_goal)
        setSubscriptionStatus(profile.subscription_status ?? 'ativo')
        setSubscriptionExpiresAt(profile.subscription_expires_at ?? null)

        setProfileData({
          full_name:       profile.full_name ?? null,
          phone:           profile.phone ?? null,
          email:           user!.email ?? '',
          document_number: profile.document_number ?? user!.user_metadata?.document_number ?? null,
          document_type:   profile.document_type   ?? user!.user_metadata?.document_type   ?? null,
          userId:          user!.id,
        })

        // Lê o contract_limit real do banco (system_settings join) — evita hardcode
        const { data: subData } = await (supabase.rpc as any)('get_user_subscription')
        if (subData?.contract_limit != null) {
          setContractLimitFromDB(Number(subData.contract_limit))
        }
      } else {
        const docNum  = user!.user_metadata?.document_number ?? null
        const docType = user!.user_metadata?.document_type   ?? null
        // Profile doesn't exist yet — create it
        await (supabase.from('profiles') as any).insert({
          id:              user!.id,
          full_name:       user!.user_metadata?.full_name ?? null,
          phone:           user!.user_metadata?.phone ?? null,
          document_number: docNum,
          document_type:   docType,
        })
        setProfileData({
          full_name:       user!.user_metadata?.full_name ?? null,
          phone:           user!.user_metadata?.phone ?? null,
          email:           user!.email ?? '',
          document_number: docNum,
          document_type:   docType,
          userId:          user!.id,
        })
      }

      const [{ data: contractsData, error: contractsError }, { count: clientCount }] = await Promise.all([
        supabase
          .from('contracts')
          .select('id, client_id, contract_number, total_amount, total_interest, paid_amount, status, contract_date, payment_type, first_due_date, installments, clients ( name, phone, score )')
          .is('deleted_at', null)
          .eq('archived', false)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .is('deleted_at', null),
      ])

      if (contractsError) throw contractsError

      const rows = (contractsData ?? []) as any[]
      const inPlay  = rows.filter(c => c.status === 'active' || c.status === 'overdue')
      const capital = inPlay.reduce((s, c) => s + (c.total_amount ?? 0), 0)
      // Usa lógica de data (isOverdue) — mesma fonte de verdade da tabela de contratos
      const overdueByDate = inPlay.filter(c => isOverdue(c.first_due_date ?? null, c.status))
      const activeByDate  = inPlay.filter(c => !isOverdue(c.first_due_date ?? null, c.status))

      // Capital exposto = principal (sem juros) dos contratos em jogo
      const capitalExposto = inPlay.reduce((s, c) => s + ((c.total_amount ?? 0) - (c.total_interest ?? 0)), 0)
      // À receber = principal + juros (total a receber)
      const aReceber = inPlay.reduce((s, c) => s + (c.total_amount ?? 0), 0)

      setMetrics({
        capitalExposto,
        aReceber,
        contratosAtivos: inPlay.length,
        clientesTotal:   clientCount ?? 0,
      })

      setContracts(rows.map(c => ({
        id:              c.id,
        client_id:       c.client_id,
        client_name:     c.clients?.name ?? '—',
        client_phone:    c.clients?.phone ?? null,
        client_score:    c.clients?.score ?? 'neutro',
        total_amount:    c.total_amount ?? 0,
        total_interest:  c.total_interest ?? 0,
        paid_amount:     c.paid_amount ?? 0,
        status:          c.status,
        contract_date:   c.contract_date,
        first_due_date:  c.first_due_date ?? null,
        payment_type:    c.payment_type,
        installments:    c.installments ?? 1,
        contract_number: c.contract_number ?? null,
        archived:        c.archived ?? false,
      })))
    } catch (err: any) {
      console.error('[Dashboard] loadDashboard error:', err)
      setMetrics({ capitalExposto: 0, aReceber: 0, contratosAtivos: 0, clientesTotal: 0 })
      setContracts([])
    }
    setLoading(false)
  }

  function handleContractCreated() {
    setShowModal(false)
    setToast('Contrato criado com sucesso!')
    loadDashboard()
  }

  // Global Search
  const [globalSearch, setGlobalSearch] = useState('')
  const [showGlobalSearch, setShowGlobalSearch] = useState(false)

  // Payment Modal
  const [paymentContract, setPaymentContract] = useState<RecentContract | null>(null)

  function handleOpenPayment(contract: RecentContract) {
    setPaymentContract(contract)
  }

  function handlePaymentDone() {
    setPaymentContract(null)
    loadDashboard()
    if (activePage === 'relatorios') loadReports()
  }

  async function handleDelete(contractId: string) {
    const contract = contracts.find(c => c.id === contractId)
    const isPaid   = contract?.status === 'settled'
    try {
      if (isPaid) {
        // Paid: archive so it disappears from the list but stays in DB for reporting
        const { error } = await (supabase.from('contracts') as any)
          .update({ archived: true })
          .eq('id', contractId)
        if (error) throw error
        setToast('Contrato arquivado com sucesso!')
      } else {
        // Pending / overdue: hard delete (data entry mistake)
        await (supabase.from('installments') as any)
          .delete()
          .eq('contract_id', contractId)
        const { error } = await (supabase.from('contracts') as any)
          .delete()
          .eq('id', contractId)
        if (error) throw error
        setToast('Contrato excluído com sucesso!')
      }
      loadDashboard()
      setArchivedList([])          // invalidate so next visit re-fetches
      if (activePage === 'relatorios') loadReports()
    } catch {
      setToast('Erro ao excluir contrato.')
    }
  }

  async function loadArchivedContracts() {
    setLoadingArchived(true)
    try {
      const { data, error } = await (supabase.from('contracts') as any)
        .select('id, client_id, contract_number, total_amount, total_interest, paid_amount, status, contract_date, payment_type, first_due_date, installments, archived, clients ( name, phone, score )')
        .is('deleted_at', null)
        .eq('archived', true)
        .order('created_at', { ascending: false })
        .limit(200)
      if (error) throw error
      const rows = (data ?? []) as any[]
      setArchivedList(rows.map(c => ({
        id:              c.id,
        client_id:       c.client_id,
        client_name:     c.clients?.name ?? '—',
        client_phone:    c.clients?.phone ?? null,
        client_score:    c.clients?.score ?? 'neutro',
        total_amount:    c.total_amount  ?? 0,
        total_interest:  c.total_interest ?? 0,
        paid_amount:     c.paid_amount ?? 0,
        status:          c.status,
        contract_date:   c.contract_date,
        first_due_date:  c.first_due_date ?? null,
        payment_type:    c.payment_type,
        installments:    c.installments ?? 1,
        contract_number: c.contract_number ?? null,
        archived:        true,
      })))
    } catch (e) {
      console.error('[loadArchivedContracts]', e)
    }
    setLoadingArchived(false)
  }

  async function loadAdminStats() {
    setLoadingAdmin(true)
    try {
      const { data, error } = await supabase.rpc('get_admin_stats')
      if (error) throw error
      setAdminStats(data as AdminStats)
    } catch {
      setToast('Erro ao carregar dados do painel master.')
    }
    setLoadingAdmin(false)
  }

  async function adminSetPlan(userId: string, plan: PlanStatus) {
    try {
      await (supabase.rpc as any)('admin_set_plan', { p_user_id: userId, p_plan: plan })
      setToast(`Plano atualizado para ${plan}!`)
      loadAdminStats()
    } catch {
      setToast('Erro ao atualizar plano.')
    }
  }

  async function loadClientsPage() {
    setLoadingClients(true)
    try {
      // getUser() valida o JWT com o servidor — não usa cache local que pode estar expirado
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) {
        console.error('[loadClientsPage] erro de autenticação:', authErr)
        setClientsData([])
        setLoadingClients(false)
        return
      }
      const uid = user.id
      console.log('Buscando clientes para o UID:', uid)

      // Queries sequenciais para facilitar diagnóstico
      const { data: cls, error: clsErr } = await (supabase.from('clients') as any)
        .select('id, name, phone, score')
        .eq('user_id', uid)
        .is('deleted_at', null)
        .order('name')

      if (clsErr) console.error('Erro ao carregar clientes:', clsErr)

      const { data: cts } = await (supabase.from('contracts') as any)
        .select('client_id, total_amount, status, first_due_date')
        .eq('user_id', uid)
        .is('deleted_at', null)

      const clientRows = Array.isArray(cls) ? cls : []
      const cts_       = Array.isArray(cts) ? cts : []

      // Calcula e persiste score automaticamente com base no histórico
      const scoreUpdates: { id: string; score: string }[] = []
      const mappedClients = clientRows.map((c: any) => {
        const mine       = cts_.filter((ct: any) => ct.client_id === c.id)
        const inPlayList = mine.filter((ct: any) => ct.status === 'active' || ct.status === 'overdue')
        const hasOverdue = inPlayList.some((ct: any) => isOverdue(ct.first_due_date ?? null, ct.status))
        const hasSettled = mine.some((ct: any) => ct.status === 'settled')
        const autoScore  = hasOverdue ? 'mal_pagador' : (hasSettled && !hasOverdue) ? 'bom_pagador' : 'neutro'
        if (autoScore !== (c.score ?? 'neutro')) scoreUpdates.push({ id: c.id, score: autoScore })
        const active = inPlayList
        return {
          id:             c.id,
          name:           c.name,
          phone:          c.phone ?? null,
          score:          autoScore,
          contract_count: mine.length,
          total_balance:  active.reduce((s: number, ct: any) => s + (ct.total_amount ?? 0), 0),
        }
      })

      // Persiste scores atualizados em background
      scoreUpdates.forEach(({ id, score }) => {
        ;(supabase.from('clients') as any).update({ score }).eq('id', id)
      })

      setClientsData(mappedClients)
    } catch (e) {
      console.error('[Dashboard] loadClientsPage exception:', e)
      setClientsData([])
    } finally {
      setLoadingClients(false)
    }
  }

  async function loadReports() {
    setLoadingReports(true)
    try {
      const today = new Date().toISOString().split('T')[0]

      const [settledRes, installmentsRes] = await Promise.all([
        // Settled contracts for profit totals + monthly chart
        (supabase.from('contracts') as any)
          .select('id, total_amount, total_interest, created_at')
          .eq('status', 'settled')
          .is('deleted_at', null),

        // Pending installments due in the next 7 days
        (() => {
          const limit = new Date(); limit.setDate(limit.getDate() + 7)
          return (supabase.from('installments') as any)
            .select('id, due_date, amount, contracts(clients(name))')
            .eq('status', 'pending')
            .gte('due_date', today)
            .lte('due_date', limit.toISOString().split('T')[0])
            .order('due_date', { ascending: true })
            .limit(50)
        })(),
      ])

      const settled = (settledRes.data ?? []) as any[]

      // Global totals
      setTotalProfit(settled.reduce((s: number, c: any) => s + (c.total_interest ?? 0), 0))
      setSettledContracts(settled.map((c: any) => ({
        id:             c.id,
        total_amount:   c.total_amount ?? 0,
        total_interest: c.total_interest ?? 0,
        created_at:     c.created_at ?? '',
      })))

      // Last 6 months monthly profit
      const months: MonthlyProfit[] = []
      for (let i = 5; i >= 0; i--) {
        const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i)
        const y = d.getFullYear(), mo = d.getMonth()
        const value = settled
          .filter((c: any) => { const cd = new Date(c.created_at); return cd.getFullYear() === y && cd.getMonth() === mo })
          .reduce((s: number, c: any) => s + (c.total_interest ?? 0), 0)
        months.push({ month: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', ''), value })
      }
      setMonthlyProfits(months)

      // Next installments — derivado dos contratos (lump_sum, sem tabela installments)
      const todayStr  = new Date().toISOString().split('T')[0]
      const limitDate = new Date(); limitDate.setDate(limitDate.getDate() + 7)
      const limitStr  = limitDate.toISOString().split('T')[0]
      setNextInstallments(
        contracts
          .filter(c =>
            c.status === 'active' &&
            !!c.first_due_date &&
            c.first_due_date >= todayStr &&
            c.first_due_date <= limitStr
          )
          .sort((a, b) => (a.first_due_date ?? '').localeCompare(b.first_due_date ?? ''))
          .map(c => ({
            id:          c.id,
            client_name: c.client_name ?? '—',
            due_date:    c.first_due_date!,
            amount:      c.total_amount ?? 0,
          }))
      )
    } catch (e) {
      console.error('[loadReports]', e)
    }
    setLoadingReports(false)
  }

  async function recalculateScore(clientId: string) {
    try {
      const { data } = await (supabase.from('contracts') as any)
        .select('status, first_due_date, paid_at')
        .eq('client_id', clientId)
        .is('deleted_at', null)
      if (!data || data.length === 0) return
      let late = 0, onTime = 0
      for (const c of data) {
        if (c.status === 'overdue') { late++; continue }
        if (c.status === 'settled') {
          const paidLate = c.paid_at && c.first_due_date && c.paid_at.slice(0, 10) > c.first_due_date
          if (paidLate) late++; else onTime++
        }
      }
      const total = late + onTime
      const lateRate = total > 0 ? late / total : 0
      const newScore = lateRate === 0 && onTime > 0 ? 'bom_pagador' : lateRate > 0.3 ? 'mal_pagador' : 'neutro'
      await (supabase.from('clients') as any).update({ score: newScore }).eq('id', clientId)
      loadContracts()
    } catch (e) { console.error('[recalculateScore]', e) }
  }

  async function loadMovimentacoes() {
    setLoadingMovimentacoes(true)
    try {
      // Entradas: contratos quitados
      const { data: settled } = await (supabase.from('contracts') as any)
        .select('id, contract_number, total_amount, total_interest, paid_at, created_at, clients ( name )')
        .eq('status', 'settled')
        .is('deleted_at', null)
        .order('paid_at', { ascending: false })
        .limit(200)

      // Saídas: todos os contratos (capital emprestado)
      const { data: all } = await (supabase.from('contracts') as any)
        .select('id, contract_number, total_amount, contract_date, clients ( name )')
        .is('deleted_at', null)
        .order('contract_date', { ascending: false })
        .limit(200)

      // Manuais: lançamentos manuais do credor
      const { data: manuais } = await (supabase.from('manual_transactions') as any)
        .select('*')
        .order('data', { ascending: false })
        .limit(500)

      const entradas: Movimentacao[] = (settled ?? []).map((c: any) => ({
        id:              `in_${c.id}`,
        tipo:            'entrada' as const,
        client_name:     c.clients?.name ?? '—',
        contract_number: c.contract_number ?? null,
        valor:           c.total_amount ?? 0,
        data:            (c.paid_at ?? c.created_at ?? '').slice(0, 10),
        descricao:       `Recebimento — juros: ${formatCurrency(c.total_interest ?? 0)}`,
      }))

      const saidas: Movimentacao[] = (all ?? []).map((c: any) => ({
        id:              `out_${c.id}`,
        tipo:            'saida' as const,
        client_name:     c.clients?.name ?? '—',
        contract_number: c.contract_number ?? null,
        valor:           c.total_amount ?? 0,
        data:            c.contract_date ?? '',
        descricao:       'Empréstimo realizado',
      }))

      const manuaisMap: Movimentacao[] = (manuais ?? []).map((m: any) => ({
        id:              `manual_${m.id}`,
        tipo:            m.tipo as 'entrada' | 'saida',
        client_name:     m.descricao || 'Lançamento manual',
        contract_number: null,
        valor:           m.valor ?? 0,
        data:            m.data ?? '',
        descricao:       m.descricao || '',
        observacoes:     m.observacoes || '',
        manual:          true,
      }))

      const merged = [...entradas, ...saidas, ...manuaisMap].sort((a, b) => b.data.localeCompare(a.data))
      setMovimentacoes(merged)
    } catch (e) {
      console.error('[loadMovimentacoes]', e)
    }
    setLoadingMovimentacoes(false)
  }

  async function saveGoal(value: number) {
    setSavingGoal(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      await (supabase.from('profiles') as any)
        .update({ monthly_goal: value })
        .eq('id', user!.id)
      setMonthlyGoal(value)
    } catch (e) {
      console.error('[saveGoal]', e)
    }
    setSavingGoal(false)
  }

  const [clientDetailId, setClientDetailId] = useState<string | null>(null)

  function handleViewClientHistory(clientId: string, _clientName: string) {
    setClientDetailId(clientId)
  }

  // Novo cliente modal
  const [showNewClientModal, setShowNewClientModal] = useState(false)

  function handleNewClientCreated() {
    setShowNewClientModal(false)
    setToast('Cliente cadastrado com sucesso!')
    loadClientsPage()
    loadDashboard()
  }

  // Editar cliente modal
  const [editClientData, setEditClientData] = useState<ClientWithStats | null>(null)

  function handleClientUpdated() {
    setEditClientData(null)
    setToast('Cliente atualizado com sucesso!')
    loadClientsPage()
  }

  // Soft delete cliente
  async function handleDeleteClient(id: string) {
    try {
      await (supabase.from('clients') as any)
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      setToast('Cliente removido da listagem.')
      loadClientsPage()
    } catch {
      setToast('Erro ao remover cliente.')
    }
  }

  // Active contracts = active + overdue (not settled/archived)
  const activeContractCount = contracts.filter(c => c.status === 'active' || c.status === 'overdue').length
  // Limit comes from system_settings via get_user_subscription (999999 = Pro unlimited)
  const CONTRACT_LIMIT = contractLimitFromDB >= 999999 ? Infinity : contractLimitFromDB
  const isLimitReached = CONTRACT_LIMIT !== Infinity && activeContractCount >= CONTRACT_LIMIT
  const isBlocked = subscriptionStatus === 'bloqueado'

  function handleNewContractClick() {
    if (isBlocked) { setToast('Sua assinatura está pendente. Entre em contato com o administrador.'); return }
    if (isLimitReached) setShowUpgradeModal(true)
    else setShowModal(true)
  }

  function contractPriority(c: { status: string; first_due_date: string | null }) {
    if (isOverdue(c.first_due_date, c.status)) return 0  // Vencido
    if (c.status === 'active')                 return 1  // A Receber
    if (c.status === 'settled')                return 2  // Pago
    return 3
  }

  const baseList = filter === 'archived' ? archivedList : contracts
  const filteredContracts = baseList
    .filter(c => !clientFilter || c.client_id === clientFilter.id)
    .filter(c => !contractSearch || c.client_name.toLowerCase().includes(contractSearch.toLowerCase()))
    .filter(c => {
      if (filter === 'active')  return c.status === 'active' && !isOverdue(c.first_due_date, c.status)
      if (filter === 'overdue') return (c.status === 'active' || c.status === 'overdue') && isOverdue(c.first_due_date, c.status)
      return true  // 'all' and 'archived' need no extra status filter
    })
    .sort((a, b) => {
      const pa = contractPriority(a), pb = contractPriority(b)
      if (pa !== pb) return pa - pb
      const dA = a.first_due_date ?? a.contract_date
      const dB = b.first_due_date ?? b.contract_date
      return dA.localeCompare(dB)
    })

  // Contratos tab: 'all' merges active + archived into one unified list
  const baseListFull = filter === 'all'
    ? [...contracts, ...archivedList].sort((a, b) => b.contract_date.localeCompare(a.contract_date))
    : (filter === 'archived' ? archivedList : contracts)
  const filteredContractsFull = baseListFull
    .filter(c => !clientFilter || c.client_id === clientFilter.id)
    .filter(c => {
      if (!contractSearch) return true
      const s = contractSearch.toLowerCase()
      if (c.client_name.toLowerCase().includes(s)) return true
      // also match by amount digits (e.g. "1500" matches R$ 1.500,00)
      const digits = contractSearch.replace(/\D/g, '')
      return digits.length >= 2 && String(Math.round(c.total_amount)).includes(digits)
    })
    .filter(c => {
      const dateRef = c.first_due_date ?? c.contract_date
      if (contractDateFrom && dateRef < contractDateFrom) return false
      if (contractDateTo   && dateRef > contractDateTo)   return false
      return true
    })
    .filter(c => {
      if (filter === 'active')  return c.status === 'active' && !isOverdue(c.first_due_date, c.status)
      if (filter === 'overdue') return (c.status === 'active' || c.status === 'overdue') && isOverdue(c.first_due_date, c.status)
      return true
    })
    .sort((a, b) => {
      const pa = contractPriority(a), pb = contractPriority(b)
      if (pa !== pb) return pa - pb
      const dA = a.first_due_date ?? a.contract_date
      const dB = b.first_due_date ?? b.contract_date
      return dA.localeCompare(dB)
    })
  const allContractsCount = contracts.length + archivedList.length

  const sidebarProps = {
    activePage,
    onNavigate: (p: NavPage) => { setActivePage(p); setSidebarOpen(false) },
    onLogout: () => supabase.auth.signOut(),
    onOpenProfile: () => setShowProfileModal(true),
    userName,
    userRole,
    planName,
    contractCount: activeContractCount,
    contractLimit: CONTRACT_LIMIT,
    onGoAdmin,
    overdueCount: metrics?.inadimplencia ?? 0,
    onSearch: () => setShowGlobalSearch(true),
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">

      {/* ── Sidebar desktop ── */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-white border-r border-slate-100 min-h-screen sticky top-0 h-screen">
        <Sidebar {...sidebarProps} />
      </aside>

      {/* ── Sidebar mobile overlay ── */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSidebarOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-64 bg-white shadow-2xl flex flex-col z-50">
            <Sidebar {...sidebarProps} />
          </aside>
        </div>
      )}

      {/* ── Conteúdo principal ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Topbar mobile */}
        <div className="lg:hidden flex items-center justify-between px-4 py-3 bg-white border-b border-slate-100 sticky top-0 z-10">
          <button onClick={() => setSidebarOpen(true)} className="p-2 rounded-xl text-gray-500 hover:bg-slate-100 transition-colors">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4" style={{ fill: BRAND, color: BRAND }} strokeWidth={0} />
            <span className="font-bold text-gray-900 text-sm">Factoring</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGlobalSearch(true)}
              className="p-2 rounded-xl text-gray-500 hover:bg-slate-100 transition-colors"
            >
              <Search className="w-4 h-4" />
            </button>
            <button
              onClick={handleNewContractClick}
              className="flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-2 rounded-xl"
              style={{ background: BRAND }}
            >
              <Plus className="w-3.5 h-3.5" />
              Novo
            </button>
          </div>
        </div>

      {/* Global Search Overlay */}
      {showGlobalSearch && (
        <GlobalSearch
          contracts={contracts}
          onClose={() => { setShowGlobalSearch(false); setGlobalSearch('') }}
          onNavigateContract={() => { setActivePage('contratos'); setShowGlobalSearch(false) }}
          onNavigateClient={(clientId, clientName) => { handleViewClientHistory(clientId, clientName); setActivePage('clientes'); setShowGlobalSearch(false) }}
          globalSearch={globalSearch}
          setGlobalSearch={setGlobalSearch}
        />
      )}

      <main className="flex-1 px-6 py-8 max-w-5xl mx-auto w-full">

        {/* ── INÍCIO ── */}
        {activePage === 'inicio' && <>

          {isBlocked && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-100 rounded-3xl px-5 py-4 mb-6">
              <Lock className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-red-500 text-sm font-medium">
                Sua assinatura está pendente. Entre em contato com o administrador para reativar seu acesso.
              </p>
            </div>
          )}

          <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">{greeting()}, {userName} 👋</h1>
              <p className="text-gray-400 text-sm mt-0.5 capitalize">{todayFormatted()}</p>
            </div>
            <button
              onClick={handleNewContractClick}
              className="flex items-center gap-2 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-sm transition-all active:scale-95"
              style={{ background: BRAND }}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.92)')}
              onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
            >
              <Plus className="w-4 h-4" />
              Novo Contrato
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-100 rounded-3xl px-6 py-4 flex items-center gap-3 mb-6">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
              <p className="text-red-500 text-sm flex-1">{error}</p>
              <button onClick={loadDashboard} className="text-red-400 hover:text-red-600 transition-colors">
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          )}

          {loading ? <MetricsSkeleton /> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <MetricCardHero label="Capital Exposto" value={formatCurrency(metrics?.capitalExposto ?? 0)} sub="Capital em circulação" />
              <MetricCardHero label="À Receber" value={formatCurrency(metrics?.aReceber ?? 0)} sub="Capital + juros" color="#6D28D9" />
              <MetricCard icon={<FileText className="w-5 h-5" style={{ color: BRAND }} />} label="Contratos Ativos" value={String(metrics?.contratosAtivos ?? 0)} bg="#4ABCB115" />
              <MetricCard icon={<Users className="w-5 h-5 text-violet-500" />}             label="Clientes Totais" value={String(metrics?.clientesTotal ?? 0)}   bg="#8B5CF615" />
            </div>
          )}

          {!loading && <DailyAlerts contracts={contracts} />}

          <ContractTable
            title="Atividade Recente"
            contracts={contracts}
            filteredContracts={filteredContracts}
            loading={loading || (filter === 'archived' && loadingArchived)}
            filter={filter}
            setFilter={setFilter}
            contractSearch={contractSearch}
            setContractSearch={setContractSearch}
            clientFilter={clientFilter}
            clearClientFilter={() => setClientFilter(null)}
            onPayment={handleOpenPayment}
            onDelete={handleDelete}
            onViewClient={handleViewClientHistory}
            onNew={handleNewContractClick}
            archivedCount={archivedList.length}
            showSearch={false}
          />
        </>}

        {/* ── CONTRATOS ── */}
        {activePage === 'contratos' && <>
          <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-gray-900">Contratos</h1>
              <p className="text-gray-400 text-sm mt-0.5">Gerencie todos os contratos</p>
            </div>
            <button
              onClick={handleNewContractClick}
              className="flex items-center gap-2 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-sm transition-all active:scale-95"
              style={{ background: BRAND }}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.92)')}
              onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
            >
              <Plus className="w-4 h-4" />
              Novo Contrato
            </button>
          </div>
          <ContractTable
            title="Todos os Contratos"
            contracts={contracts}
            filteredContracts={filteredContractsFull}
            loading={loading || ((filter === 'archived' || filter === 'all') && loadingArchived)}
            filter={filter}
            setFilter={setFilter}
            contractSearch={contractSearch}
            setContractSearch={setContractSearch}
            dateFrom={contractDateFrom}
            dateTo={contractDateTo}
            setDateFrom={setContractDateFrom}
            setDateTo={setContractDateTo}
            clientFilter={clientFilter}
            clearClientFilter={() => setClientFilter(null)}
            onPayment={handleOpenPayment}
            onDelete={handleDelete}
            onViewClient={handleViewClientHistory}
            onNew={handleNewContractClick}
            archivedCount={archivedList.length}
            allCount={allContractsCount}
            showSearch
          />
        </>}

        {/* ── CLIENTES ── */}
        {activePage === 'clientes' && (
          isBlocked ? (
            <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
              <div className="w-16 h-16 rounded-3xl bg-red-50 flex items-center justify-center">
                <Lock className="w-8 h-8 text-red-400" />
              </div>
              <div>
                <p className="text-gray-800 font-semibold text-lg">Acesso bloqueado</p>
                <p className="text-gray-400 text-sm mt-1.5 max-w-sm">
                  Sua assinatura está pendente. Entre em contato com o administrador para reativar o acesso.
                </p>
              </div>
            </div>
          ) : (
            <ClientsView
              clientsData={clientsData}
              loading={loadingClients}
              clientSearch={clientSearch}
              setClientSearch={setClientSearch}
              onViewDetails={id => setClientDetailId(id)}
              onViewHistory={id => { setClientDetailId(id) }}
              onEditClient={setEditClientData}
              onDeleteClient={handleDeleteClient}
              onNewContract={handleNewContractClick}
              onNewClient={() => setShowNewClientModal(true)}
            />
          )
        )}

        {/* ── AFILIADOS ── */}
        {activePage === 'afiliados' && (
          <AfiliadosView />
        )}

        {/* ── MOVIMENTAÇÕES ── */}
        {activePage === 'movimentacoes' && (
          <MovimentacoesView
            movimentacoes={movimentacoes}
            loading={loadingMovimentacoes}
            onReload={loadMovimentacoes}
          />
        )}

        {/* ── CONTAS A RECEBER ── */}
        {activePage === 'contas' && (
          <ContasAReceberView
            contracts={contracts}
            loading={loading}
            onPayment={handleOpenPayment}
          />
        )}

        {/* ── RELATÓRIOS ── */}
        {activePage === 'relatorios' && (
          <ReportsView
            contracts={contracts}
            monthlyProfits={monthlyProfits}
            totalProfit={totalProfit}
            settledContracts={settledContracts}
            nextInstallments={nextInstallments}
            loading={loadingReports}
            onReload={loadReports}
            monthlyGoal={monthlyGoal}
            savingGoal={savingGoal}
            onSaveGoal={saveGoal}
          />
        )}

        {/* ── ASSINATURA ── */}
        {activePage === 'configuracoes' && (
          <SubscriptionView
            planName={planName}
            subscriptionStatus={subscriptionStatus}
            subscriptionExpiresAt={subscriptionExpiresAt}
            documentNumber={profileData?.document_number}
          />
        )}

        {/* ── PAINEL MASTER ── */}
        {activePage === 'master' && (
          <MasterAdmin
            stats={adminStats}
            loading={loadingAdmin}
            onSetPlan={adminSetPlan}
            onReload={loadAdminStats}
          />
        )}

      </main>

      {/* Modal de novo contrato */}
      {showModal && (
        <NewContractModal
          onClose={() => setShowModal(false)}
          onSuccess={handleContractCreated}
          onClientCreated={loadClientsPage}
          activeContractCount={activeContractCount}
          contractLimit={CONTRACT_LIMIT}
        />
      )}

      {/* Upgrade Modal — pagamento acontece dentro do modal, sem navegação */}
      {showUpgradeModal && (
        <UpgradeModal
          onClose={() => setShowUpgradeModal(false)}
          currentPlan={planName}
          documentNumber={profileData?.document_number ?? undefined}
        />
      )}

      {/* Edit Profile Modal */}
      {showProfileModal && profileData && (
        <EditProfileModal
          profile={profileData}
          onClose={() => setShowProfileModal(false)}
          onSaved={updated => {
            setProfileData(prev => prev ? { ...prev, ...updated } : prev)
            if (updated.full_name) setUserName(updated.full_name.split(' ')[0])
          }}
        />
      )}

      {/* Novo Cliente Modal */}
      {showNewClientModal && (
        <NewClientModal
          onClose={() => setShowNewClientModal(false)}
          onSuccess={handleNewClientCreated}
        />
      )}

      {/* Central do Cliente */}
      {clientDetailId && (
        <ClientDetailModal
          clientId={clientDetailId}
          onClose={() => setClientDetailId(null)}
        />
      )}

      {/* Editar Cliente */}
      {editClientData && (
        <ClientFormModal
          initialClient={editClientData}
          onClose={() => setEditClientData(null)}
          onSuccess={handleClientUpdated}
        />
      )}

      {/* Payment Modal */}
      {paymentContract && (
        <PaymentModal
          contract={paymentContract}
          onClose={() => setPaymentContract(null)}
          onSuccess={(msg) => { setToast(msg); handlePaymentDone() }}
          onSettled={(clientId) => recalculateScore(clientId)}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 bg-gray-900 text-white text-sm font-medium px-5 py-3.5 rounded-2xl shadow-lg animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-[#4ABCB1] shrink-0" />
          {toast}
        </div>
      )}

      </div> {/* flex-1 flex flex-col min-w-0 */}
    </div>
  )
}

// ─── Modal de Novo Contrato (Modal Inteligente) ───────────────────────────────

type Periodicity = 'daily' | 'weekly' | 'biweekly' | 'monthly'

function NewContractModal({ onClose, onSuccess, onClientCreated, activeContractCount, contractLimit }: {
  onClose: () => void
  onSuccess: () => void
  onClientCreated?: () => Promise<void>
  activeContractCount: number
  contractLimit: number | typeof Infinity
}) {
  // Tipo de contrato
  const [contractType, setContractType] = useState<'lump_sum' | 'installments'>('lump_sum')

  // Busca de cliente
  const [clientSearch, setClientSearch] = useState('')
  const [clients, setClients]           = useState<Client[]>([])
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchRef = useRef<HTMLDivElement>(null)

  // Quick-add cliente
  const [showQuickAdd, setShowQuickAdd] = useState(false)
  const [quickName, setQuickName]       = useState('')
  const [quickPhone, setQuickPhone]       = useState('')
  const [quickError, setQuickError]       = useState<string | null>(null)
  const [savingClient, setSavingClient]   = useState(false)

  // Campos financeiros
  const [amountRaw, setAmountRaw]     = useState('')
  const [interest, setInterest]       = useState('')
  const [dueDate, setDueDate]         = useState('')
  const [lateFeeRate, setLateFeeRate] = useState('')

  // Parcelado
  const [installmentCount, setInstallmentCount] = useState('3')
  const [periodicity, setPeriodicity] = useState<Periodicity>('monthly')
  const [skipWeekends, setSkipWeekends] = useState(false)

  // Docs & notas
  const [notes, setNotes] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  // Form state
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [showSummary, setShowSummary] = useState(false)

  // Valores derivados
  const principal     = parseCurrencyInput(amountRaw)
  const interestRate  = parseFloat(interest) || 0
  const totalInterest = principal * interestRate / 100
  const totalAmount   = principal + totalInterest
  const installCount  = Math.max(1, parseInt(installmentCount) || 1)
  const installValue  = contractType === 'installments' && installCount > 0
    ? totalAmount / installCount
    : totalAmount

  // Prévia de datas das parcelas
  function getInstallmentDates(): Date[] {
    if (!dueDate) return []
    const first = new Date(dueDate + 'T00:00:00')
    const dates: Date[] = [first]
    for (let i = 1; i < installCount; i++) {
      let next: Date
      if (periodicity === 'daily')    next = addDays(dates[i - 1], 1)
      else if (periodicity === 'weekly')   next = addDays(dates[i - 1], 7)
      else if (periodicity === 'biweekly') next = addDays(dates[i - 1], 14)
      else next = addMonths(dates[i - 1], 1)

      if (skipWeekends) {
        const dow = next.getDay()
        if (dow === 6) next = addDays(next, 2)
        else if (dow === 0) next = addDays(next, 1)
      }
      dates.push(next)
    }
    return dates
  }

  const installDates = contractType === 'installments' ? getInstallmentDates() : []

  // Dias até vencimento
  const daysUntilDue = dueDate
    ? Math.ceil((new Date(dueDate + 'T00:00:00').getTime() - new Date().setHours(0,0,0,0)) / 86400000)
    : null

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node))
        setShowDropdown(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  // Cache of recent clients (populated on first focus or mount)
  const recentClientsRef = useRef<Client[]>([])

  async function fetchRecentClients(): Promise<Client[]> {
    if (recentClientsRef.current.length > 0) return recentClientsRef.current
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []
    const { data } = await (supabase.from('clients') as any)
      .select('id, name, nickname, score')
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(8)
    const list = Array.isArray(data) ? (data as Client[]) : []
    recentClientsRef.current = list
    return list
  }

  // On focus: always show recent clients immediately (fetch if not cached yet)
  async function handleSearchFocus() {
    if (clientSearch.length > 0) {
      setShowDropdown(true)
      return
    }
    const recent = await fetchRecentClients()
    setClients(recent)
    setShowDropdown(true)
  }

  // Busca de clientes com debounce
  useEffect(() => {
    if (clientSearch.length < 1) {
      setClients(recentClientsRef.current)
      return
    }
    const timer = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await (supabase.from('clients') as any)
        .select('id, name, nickname, score')
        .eq('user_id', user.id)
        .is('deleted_at', null)
        .ilike('name', `%${clientSearch}%`)
        .limit(6)

      if (error) console.error('Erro real do Supabase (busca):', error)
      setClients(Array.isArray(data) ? (data as Client[]) : [])
      setShowDropdown(true)
    }, 300)
    return () => clearTimeout(timer)
  }, [clientSearch])

  async function handleQuickAddClient() {
    if (!quickName.trim()) return
    setSavingClient(true)
    setQuickError(null)
    try {
      const { data: { user }, error: authErr } = await supabase.auth.getUser()
      if (authErr || !user) throw new Error('Usuário não autenticado')
      console.log('Salvando cliente rápido para user_id:', user.id)
      const { data, error: err } = await (supabase.from('clients') as any).insert({
        user_id: user.id,
        name: quickName.trim(),
        phone: quickPhone.trim() || null,
      }).select('id, name, nickname').single()
      if (err) throw err
      setSelectedClient(data as Client)
      setShowQuickAdd(false)
      setQuickName('')
      setQuickPhone('')
      setQuickError(null)
      await onClientCreated?.()  // aguarda o refresh da lista de clientes
    } catch (err: any) {
      const msg = err?.message ?? 'Erro ao salvar cliente.'
      setQuickError(msg)
      console.dir(err)  // objeto completo do erro para diagnóstico
    }
    setSavingClient(false)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!selectedClient)              { setError('Selecione um cliente.'); return }
    if (!principal || principal <= 0) { setError('Informe o valor do empréstimo.'); return }
    if (!dueDate)                     { setError('Informe a data de vencimento.'); return }

    // Secondary paywall guard (primary is in handleNewContractClick)
    if (contractLimit !== Infinity && activeContractCount >= contractLimit) {
      setError('Limite de contratos do seu plano atingido.')
      return
    }

    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      const { data: newContract, error: dbError } = await (supabase.from('contracts') as any).insert({
        user_id:          user!.id,
        client_id:        selectedClient.id,
        contract_date:    new Date().toISOString().split('T')[0],
        principal_amount: principal,
        interest_type:    'percent',
        interest_value:   interestRate,
        late_fee_enabled: !!lateFeeRate,
        late_fee_rate:    lateFeeRate ? parseFloat(lateFeeRate) : null,
        payment_type:     contractType,
        installments:     contractType === 'installments' ? installCount : 1,
        first_due_date:   dueDate,
        total_amount:     totalAmount,
        total_interest:   totalInterest,
        notes:            notes.trim() || null,
      }).select('id').single()

      if (dbError) throw dbError

      // Criar registros de parcelas individuais
      if (contractType === 'installments' && installCount > 1 && newContract?.id) {
        const installmentRecords = installDates.map((date, i) => ({
          contract_id:    newContract.id,
          installment_no: i + 1,
          due_date:       date.toISOString().split('T')[0],
          principal:      parseFloat((principal / installCount).toFixed(2)),
          interest:       parseFloat((totalInterest / installCount).toFixed(2)),
          total_amount:   parseFloat(installValue.toFixed(2)),
          status:         'pending',
        }))
        await (supabase.from('installments') as any).insert(installmentRecords)
      }

      onSuccess()
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar. Tente novamente.')
    }
    setSaving(false)
  }

  const periodicityOptions: { value: Periodicity; label: string }[] = [
    { value: 'daily',    label: 'Diário' },
    { value: 'weekly',   label: 'Semanal' },
    { value: 'biweekly', label: 'Quinzenal' },
    { value: 'monthly',  label: 'Mensal' },
  ]

  return (
    <div
      className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white w-full max-w-3xl rounded-[32px] shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header fixo */}
        <div className="flex items-start justify-between px-8 pt-8 pb-6 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">Novo Contrato</h2>
            <p className="text-gray-400 text-sm mt-0.5">Preencha os dados do empréstimo</p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors p-1.5 rounded-xl hover:bg-slate-100 mt-0.5"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corpo com scroll */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

          {/* ── Coluna esquerda: Formulário ── */}
          <form
            id="contract-form"
            onSubmit={handleSubmit}
            className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-5"
          >

            {/* Tipo de contrato */}
            <div className="flex flex-col gap-2">
              <label className="text-sm font-medium text-gray-700">Tipo de contrato</label>
              <div className="flex gap-2 p-1 bg-slate-100 rounded-2xl">
                {([
                  { value: 'lump_sum',     label: 'Parcela Única' },
                  { value: 'installments', label: 'Parcelado' },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setContractType(opt.value)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                      contractType === opt.value
                        ? 'bg-white shadow-sm text-gray-900'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cliente */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Cliente</label>
                {!selectedClient && !showQuickAdd && (
                  <button
                    type="button"
                    onClick={() => setShowQuickAdd(true)}
                    className="flex items-center gap-1 text-xs font-semibold hover:opacity-80 transition-opacity"
                    style={{ color: BRAND }}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Novo cliente
                  </button>
                )}
              </div>

              {/* Quick-add inline */}
              {showQuickAdd && (
                <div className="flex flex-col gap-2 p-4 border border-[#4ABCB140] rounded-2xl bg-[#4ABCB108]">
                  <p className="text-xs font-medium text-gray-500 mb-0.5">Cadastro rápido</p>
                  <input
                    type="text"
                    value={quickName}
                    onChange={e => setQuickName(e.target.value)}
                    placeholder="Nome completo"
                    className={`${inputCls} px-4 py-3`}
                    autoFocus
                  />
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                    <input
                      type="tel"
                      value={quickPhone}
                      onChange={e => setQuickPhone(formatPhone(e.target.value))}
                      placeholder="(11) 99999-9999"
                      className={`${inputCls} pl-10 pr-4 py-3`}
                    />
                  </div>
                  {quickError && (
                    <p className="text-xs text-red-500 bg-red-50 rounded-xl px-3 py-2">{quickError}</p>
                  )}
                  <div className="flex gap-2 mt-1">
                    <button
                      type="button"
                      onClick={() => { setShowQuickAdd(false); setQuickName(''); setQuickPhone(''); setQuickError(null) }}
                      className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-400 text-xs font-medium hover:bg-slate-50 transition-colors"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickAddClient}
                      disabled={!quickName.trim() || savingClient}
                      className="flex-1 py-2.5 rounded-xl text-white text-xs font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5"
                      style={{ background: BRAND }}
                    >
                      {savingClient && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Salvar e selecionar
                    </button>
                  </div>
                </div>
              )}

              {/* Busca ou cliente selecionado */}
              {!showQuickAdd && (
                <div ref={searchRef} className="relative">
                  {selectedClient ? (
                    <div className="flex items-center justify-between px-4 py-3.5 border border-[#4ABCB1] rounded-2xl bg-[#4ABCB108]">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-semibold" style={{ background: BRAND }}>
                          {getInitials(selectedClient.name)}
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{selectedClient.name}</p>
                          <ScoreBadge score={selectedClient.score} />
                        </div>
                      </div>
                      <button type="button" onClick={() => { setSelectedClient(null); setClientSearch('') }}
                        className="text-gray-300 hover:text-gray-500 transition-colors">
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                          type="text"
                          value={clientSearch}
                          onChange={e => setClientSearch(e.target.value)}
                          onFocus={handleSearchFocus}
                          placeholder="Buscar cliente pelo nome..."
                          className={`${inputCls} pl-10 pr-4 py-3.5`}
                        />
                      </div>
                      {showDropdown && clients.length > 0 && (
                        <div className="absolute top-full mt-1.5 left-0 right-0 bg-white border border-gray-100 rounded-2xl shadow-lg z-10 overflow-hidden">
                          {!clientSearch && (
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-4 pt-3 pb-1">
                              Clientes recentes
                            </p>
                          )}
                          {clients.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => { setSelectedClient(c); setShowDropdown(false); setClientSearch('') }}
                              className="flex items-center gap-3 w-full px-4 py-3 hover:bg-slate-50 text-left transition-colors"
                            >
                              <div className="w-7 h-7 rounded-xl flex items-center justify-center text-white text-xs font-semibold shrink-0" style={{ background: BRAND }}>
                                {getInitials(c.name)}
                              </div>
                              <div>
                                <p className="text-sm font-medium text-gray-900">{c.name}</p>
                                <ScoreBadge score={c.score} />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Valor + Juros */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Valor do empréstimo</label>
                <div className="relative">
                  <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={amountRaw}
                    onChange={e => setAmountRaw(formatCurrencyInput(e.target.value))}
                    placeholder="0,00"
                    className={`${inputCls} pl-10 pr-4 py-3.5`}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Taxa de juros (%)</label>
                <div className="relative">
                  <Percent className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={interest}
                    onChange={e => setInterest(e.target.value)}
                    placeholder="0,00"
                    className={`${inputCls} pl-10 pr-4 py-3.5`}
                  />
                </div>
              </div>
            </div>

            {/* Mora por atraso */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Mora por atraso (% ao dia)
                <span className="text-gray-400 font-normal ml-1">— opcional</span>
              </label>
              <div className="relative">
                <Percent className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lateFeeRate}
                  onChange={e => setLateFeeRate(e.target.value)}
                  placeholder="ex: 0,10"
                  className={`${inputCls} pl-10 pr-4 py-3.5`}
                />
              </div>
              {lateFeeRate && parseFloat(lateFeeRate) > 0 && (
                <p className="text-xs text-amber-500">
                  Acréscimo de {lateFeeRate}% por dia sobre o valor total após o vencimento.
                </p>
              )}
            </div>

            {/* Data de vencimento */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">
                  {contractType === 'lump_sum' ? 'Data de vencimento' : 'Data da 1ª parcela'}
                </label>
                {daysUntilDue !== null && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Clock className="w-3 h-3" />
                    {daysUntilDue === 0 ? 'Hoje' : daysUntilDue > 0 ? `em ${daysUntilDue} dias` : `${Math.abs(daysUntilDue)} dias atrás`}
                  </span>
                )}
              </div>
              <div className="relative">
                <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="date"
                  value={dueDate}
                  onChange={e => setDueDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]}
                  className={`${inputCls} pl-10 pr-4 py-3.5`}
                />
              </div>
            </div>

            {/* Config de parcelamento */}
            {contractType === 'installments' && (
              <div className="flex flex-col gap-3 p-4 border border-slate-100 rounded-2xl bg-slate-50/60">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Configuração de parcelas</p>

                {/* Qtd + Periodicidade */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-gray-600">Nº de parcelas</label>
                    <div className="relative">
                      <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      <input
                        type="number"
                        min="1"
                        max="360"
                        value={installmentCount}
                        onChange={e => setInstallmentCount(e.target.value)}
                        className={`${inputCls} pl-9 pr-4 py-3 text-sm`}
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-gray-600">Periodicidade</label>
                    <div className="relative">
                      <Repeat className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      <select
                        value={periodicity}
                        onChange={e => setPeriodicity(e.target.value as Periodicity)}
                        className={`${inputCls} pl-9 pr-4 py-3 text-sm appearance-none`}
                      >
                        {periodicityOptions.map(o => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Regras de calendário */}
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <div
                    onClick={() => setSkipWeekends(v => !v)}
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all ${
                      skipWeekends ? 'border-transparent' : 'border-gray-300 bg-white'
                    }`}
                    style={skipWeekends ? { background: BRAND } : {}}
                  >
                    {skipWeekends && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 10 8"><path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                  </div>
                  <span className="text-xs text-gray-600">Mover vencimento de fim de semana para segunda-feira</span>
                </label>
              </div>
            )}

            {/* Documentos e Notas */}
            <div className="flex flex-col gap-3">
              {/* Upload */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <Paperclip className="w-4 h-4 text-gray-400" />
                  Documento
                  <span className="text-gray-400 font-normal text-xs">(opcional)</span>
                </label>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full border border-dashed border-gray-200 rounded-2xl py-4 text-sm text-gray-400 hover:border-[#4ABCB1] hover:text-[#4ABCB1] transition-colors flex items-center justify-center gap-2"
                >
                  {fileName
                    ? <><CheckCircle2 className="w-4 h-4" style={{ color: BRAND }} /><span style={{ color: BRAND }}>{fileName}</span></>
                    : <><Paperclip className="w-4 h-4" />Clique para anexar um arquivo</>
                  }
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={e => setFileName(e.target.files?.[0]?.name ?? null)}
                />
              </div>

              {/* Notas */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5">
                  <StickyNote className="w-4 h-4 text-gray-400" />
                  Observações
                  <span className="text-gray-400 font-normal text-xs">(opcional)</span>
                </label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Anotações sobre o contrato..."
                  rows={3}
                  className={`${inputCls} px-4 py-3 resize-none`}
                />
              </div>
            </div>

            {/* Erro */}
            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-px" />
                <p className="text-red-500 text-sm">{error}</p>
              </div>
            )}
          </form>

          {/* ── Coluna direita: Painel de Resumo ── */}
          <div className="md:w-64 shrink-0 border-t md:border-t-0 md:border-l border-slate-100 px-6 py-6 flex flex-col gap-5 bg-slate-50/50 md:rounded-r-[32px] overflow-y-auto">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Resumo</p>

            {/* Métricas */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-400">Principal</span>
                <span className="text-base font-semibold text-gray-900 tabular-nums">
                  {principal > 0 ? formatCurrency(principal) : '—'}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-400">Juros ({interestRate}%)</span>
                <span className="text-base font-semibold text-gray-900 tabular-nums">
                  {principal > 0 ? formatCurrency(totalInterest) : '—'}
                </span>
              </div>
              <div className="h-px bg-slate-200" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-gray-400">Total a receber</span>
                <span className="text-xl font-bold tabular-nums" style={{ color: principal > 0 ? BRAND : '#9CA3AF' }}>
                  {principal > 0 ? formatCurrency(totalAmount) : '—'}
                </span>
              </div>
              {contractType === 'installments' && installCount > 0 && principal > 0 && (
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs text-gray-400">{installCount}× de</span>
                  <span className="text-base font-semibold text-gray-900 tabular-nums">{formatCurrency(installValue)}</span>
                </div>
              )}
            </div>

            {/* Prévia das parcelas */}
            {contractType === 'installments' && installDates.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-gray-500">Vencimentos</p>
                <div className="flex flex-col gap-1.5">
                  {installDates.slice(0, 4).map((d, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <span className="text-xs text-gray-400">Parcela {i + 1}</span>
                      <span className="text-xs font-medium text-gray-700 tabular-nums">
                        {d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      </span>
                    </div>
                  ))}
                  {installDates.length > 4 && (
                    <p className="text-xs text-gray-400 text-center mt-0.5">
                      +{installDates.length - 4} parcelas
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Info */}
            {principal === 0 && (
              <div className="flex items-start gap-2 mt-auto">
                <Info className="w-3.5 h-3.5 text-gray-300 shrink-0 mt-0.5" />
                <p className="text-xs text-gray-300 leading-relaxed">Preencha o valor e os juros para ver o resumo.</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer fixo com botões */}
        {!showSummary ? (
          <div className="flex gap-3 px-8 py-5 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={!selectedClient || !principal || principal <= 0 || !dueDate}
              onClick={() => {
                if (!selectedClient)              { setError('Selecione um cliente.'); return }
                if (!principal || principal <= 0) { setError('Informe o valor do empréstimo.'); return }
                if (!dueDate)                     { setError('Informe a data de vencimento.'); return }
                setError(null)
                setShowSummary(true)
              }}
              className="flex-1 py-3.5 rounded-2xl text-white text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: BRAND }}
            >
              <FileText className="w-4 h-4" />
              Resumo do Contrato
            </button>
          </div>
        ) : (
          /* ── Tela de Resumo ── */
          <div className="flex flex-col px-8 py-6 border-t border-slate-100 shrink-0 gap-4">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-5 h-5 text-teal-500" />
              <h3 className="text-base font-bold text-gray-900">Resumo do Contrato</h3>
            </div>

            <div className="bg-slate-50 rounded-2xl divide-y divide-slate-100">
              {[
                { label: 'Cliente',         value: selectedClient?.name ?? '—' },
                { label: 'Valor emprestado', value: formatCurrency(principal) },
                { label: 'Juros',           value: `${interestRate}% = ${formatCurrency(totalInterest)}` },
                { label: 'Total a receber', value: formatCurrency(totalAmount), highlight: true },
                { label: 'Tipo',            value: contractType === 'installments' ? `Parcelado (${installCount}×)` : 'À vista' },
                { label: 'Vencimento',      value: dueDate ? new Date(dueDate + 'T00:00:00').toLocaleDateString('pt-BR') : '—' },
                ...(lateFeeRate && parseFloat(lateFeeRate) > 0
                  ? [{ label: 'Mora por atraso', value: `${lateFeeRate}% ao dia` }]
                  : []),
              ].map(row => (
                <div key={row.label} className="flex justify-between items-center px-4 py-2.5 text-sm">
                  <span className="text-gray-500">{row.label}</span>
                  <span className={`font-semibold ${row.highlight ? 'text-teal-600' : 'text-gray-900'}`}>{row.value}</span>
                </div>
              ))}
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <p className="text-red-500 text-sm">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowSummary(false)}
                className="flex-1 py-3.5 rounded-2xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Voltar
              </button>
              <button
                type="submit"
                form="contract-form"
                disabled={saving}
                className="flex-1 py-3.5 rounded-2xl text-white text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: BRAND }}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
                {saving ? 'Salvando...' : 'Confirmar Contrato'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Sidebar({ activePage, onNavigate, onLogout, onOpenProfile, userName, userRole, planName, contractCount, contractLimit, onGoAdmin, overdueCount, onSearch }: {
  activePage: NavPage
  onNavigate: (p: NavPage) => void
  onLogout: () => void
  onOpenProfile: () => void
  userName: string
  userRole: 'user' | 'admin'
  planName: PlanName
  contractCount: number
  contractLimit: number
  onGoAdmin?: () => void
  overdueCount?: number
  onSearch?: () => void
}) {
  const links: { id: NavPage; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'inicio',        label: 'Início',        icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'contratos',     label: 'Contratos',     icon: <FileText className="w-4 h-4" /> },
    { id: 'clientes',      label: 'Clientes',      icon: <Users className="w-4 h-4" /> },
    { id: 'contas',        label: 'A Receber',     icon: <Inbox className="w-4 h-4" />, badge: overdueCount && overdueCount > 0 ? overdueCount : undefined },
    { id: 'movimentacoes', label: 'Movimentações', icon: <History className="w-4 h-4" /> },
    { id: 'relatorios',    label: 'Relatórios',    icon: <BarChart2 className="w-4 h-4" /> },
    { id: 'afiliados',     label: 'Afiliados',      icon: <Gift className="w-4 h-4" />, badge: undefined },
    { id: 'configuracoes', label: 'Assinatura',     icon: <Settings className="w-4 h-4" /> },
  ]

  const isNearLimit = contractLimit !== Infinity && contractCount >= contractLimit

  const planLabel = planName === 'pro'
    ? { text: 'Pro', color: 'text-amber-600 bg-amber-50' }
    : planName === 'starter'
    ? { text: `Starter · ${contractCount}/${contractLimit}`, color: isNearLimit ? 'text-red-500 bg-red-50' : 'text-slate-500 bg-slate-100' }
    : { text: `Grátis · ${contractCount}/3`, color: isNearLimit ? 'text-red-500 bg-red-50' : 'text-slate-400 bg-slate-100' }

  return (
    <div className="flex flex-col h-full w-full">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-100 shrink-0">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: BRAND }}>
          <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
        </div>
        <div>
          <p className="font-bold text-sm text-gray-900 leading-none">Factoring</p>
          <p className="text-xs text-gray-400 mt-0.5">Gestão de empréstimos</p>
        </div>
      </div>

      {/* User card */}
      <button
        onClick={onOpenProfile}
        className="flex items-center gap-3 px-4 py-3.5 mx-3 mt-3 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-colors text-left shrink-0"
      >
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ background: BRAND }}
        >
          {getInitials(userName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900 truncate leading-none">{userName}</p>
          <span className={`inline-block mt-1 text-xs font-medium px-1.5 py-0.5 rounded-md ${planLabel.color}`}>
            {planLabel.text}
          </span>
        </div>
      </button>

      {/* Nav links */}
      <nav className="flex-1 flex flex-col gap-0.5 px-3 mt-4 overflow-y-auto">
        <button
          onClick={onSearch}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-gray-400 border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors mb-2 w-full text-left"
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-xs">Buscar...</span>
          <span className="text-[10px] font-mono bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded">⌘K</span>
        </button>
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-1">Menu</p>
        {links.map(link => {
          const active = activePage === link.id
          return (
            <button
              key={link.id}
              onClick={() => onNavigate(link.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all w-full text-left ${
                active ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-800 hover:bg-slate-50'
              }`}
              style={active ? { background: BRAND } : {}}
            >
              <span className={active ? 'text-white' : 'text-gray-400'}>{link.icon}</span>
              <span className="flex-1">{link.label}</span>
              {link.badge && !active && (
                <span className="min-w-[20px] h-5 px-1.5 rounded-full text-xs font-bold bg-red-100 text-red-500 flex items-center justify-center">
                  {link.badge > 99 ? '99+' : link.badge}
                </span>
              )}
            </button>
          )
        })}

        {/* Admin link */}
        {(userRole === 'admin' || !!onGoAdmin) && (
          <>
            <div className="my-2 border-t border-slate-100" />
            <button
              onClick={() => onGoAdmin ? onGoAdmin() : onNavigate('master')}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all w-full text-left ${
                activePage === 'master' ? 'bg-amber-500 text-white' : 'text-amber-500 hover:bg-amber-50'
              }`}
            >
              <Shield className="w-4 h-4" />
              <span>Painel Master</span>
            </button>
          </>
        )}
      </nav>

      {/* Logout */}
      <div className="px-3 py-4 shrink-0 border-t border-slate-100">
        <button
          onClick={onLogout}
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-400 hover:text-red-500 hover:bg-red-50 transition-all w-full text-left"
        >
          <LogOut className="w-4 h-4" />
          <span>Sair</span>
        </button>
      </div>
    </div>
  )
}

// ─── GlobalSearch ─────────────────────────────────────────────────────────────

function GlobalSearch({ contracts, onClose, onNavigateContract, onNavigateClient, globalSearch, setGlobalSearch }: {
  contracts: RecentContract[]
  onClose: () => void
  onNavigateContract: () => void
  onNavigateClient: (clientId: string, clientName: string) => void
  globalSearch: string
  setGlobalSearch: (v: string) => void
}) {
  const q = globalSearch.toLowerCase().trim()

  const matchedContracts = q.length < 2 ? [] : contracts.filter(c =>
    c.client_name.toLowerCase().includes(q) ||
    (c.contract_number ?? '').toLowerCase().includes(q)
  ).slice(0, 5)

  // Deduplicate clients from contracts
  const clientMap = new Map<string, { id: string; name: string; score: string }>()
  contracts.forEach(c => {
    if (!clientMap.has(c.client_id)) clientMap.set(c.client_id, { id: c.client_id, name: c.client_name, score: c.client_score })
  })
  const matchedClients = q.length < 2 ? [] : Array.from(clientMap.values()).filter(c =>
    c.name.toLowerCase().includes(q)
  ).slice(0, 4)

  const hasResults = matchedContracts.length > 0 || matchedClients.length > 0

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 px-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <Search className="w-4 h-4 text-gray-400 shrink-0" />
          <input
            autoFocus
            type="text"
            value={globalSearch}
            onChange={e => setGlobalSearch(e.target.value)}
            placeholder="Buscar contratos, clientes..."
            className="flex-1 text-sm outline-none text-gray-900 placeholder-gray-400 bg-transparent"
          />
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results */}
        <div className="max-h-96 overflow-y-auto">
          {q.length < 2 ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              Digite ao menos 2 caracteres para buscar
            </div>
          ) : !hasResults ? (
            <div className="px-5 py-8 text-center text-gray-400 text-sm">
              Nenhum resultado encontrado para "{q}"
            </div>
          ) : (
            <div className="py-2">
              {matchedContracts.length > 0 && (
                <div>
                  <p className="px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Contratos</p>
                  {matchedContracts.map(c => (
                    <button
                      key={c.id}
                      onClick={() => { onNavigateContract(); }}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: BRAND + 'CC' }}>
                        {getInitials(c.client_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{c.client_name}</p>
                        <p className="text-xs text-gray-400">
                          #{c.contract_number ?? c.id.slice(0,8)} · {formatCurrency(c.total_amount)} · {getStatusLabel(c.status, c.first_due_date)}
                        </p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
              {matchedClients.length > 0 && (
                <div>
                  <p className="px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">Clientes</p>
                  {matchedClients.map(c => (
                    <button
                      key={c.id}
                      onClick={() => onNavigateClient(c.id, c.name)}
                      className="w-full flex items-center gap-3 px-5 py-3 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: BRAND }}>
                        {getInitials(c.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                        <ScoreBadge score={c.score} />
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportToCSV(rows: Record<string, string | number>[], filename: string) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const lines = [
    headers.join(';'),
    ...rows.map(r => headers.map(h => {
      const val = String(r[h] ?? '').replace(/"/g, '""')
      return val.includes(';') || val.includes('"') ? `"${val}"` : val
    }).join(';'))
  ]
  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ─── Metric Cards ─────────────────────────────────────────────────────────────

function MetricCardHero({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  const bg = color ?? BRAND
  return (
    <div className="rounded-3xl p-6 col-span-1 sm:col-span-2 lg:col-span-1 relative overflow-hidden" style={{ background: bg }}>
      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 pointer-events-none" />
      <div className="absolute -bottom-8 -left-4 w-32 h-32 rounded-full bg-white/10 pointer-events-none" />
      <div className="relative z-10">
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-4 h-4 text-white/80" />
          <p className="text-white/80 text-xs font-medium uppercase tracking-wider">{label}</p>
        </div>
        <p className="text-white text-2xl font-bold leading-none">{value}</p>
        {sub && <p className="text-white/60 text-xs mt-2">{sub}</p>}
      </div>
    </div>
  )
}

function MetricCard({ icon, label, value, bg, valueColor }: {
  icon: React.ReactNode; label: string; value: string; bg: string; valueColor?: string
}) {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-sm">
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-4" style={{ background: bg }}>{icon}</div>
      <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className="text-2xl font-bold text-gray-900" style={valueColor ? { color: valueColor } : {}}>{value}</p>
    </div>
  )
}

// ─── Linha + Empty + Skeletons ────────────────────────────────────────────────

function ScoreBadge({ score }: { score?: string | null }) {
  if (!score || score === 'neutro') return null
  const color = SCORE_COLOR[score] ?? '#64748b'
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: color + '18', color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {SCORE_LABEL[score] ?? score}
    </span>
  )
}

function isOverdue(dueDateStr: string | null, status: string): boolean {
  if (!dueDateStr || status === 'settled' || status === 'cancelled') return false
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return new Date(dueDateStr + 'T00:00:00') < today
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
    </svg>
  )
}

// ─── InstallmentsAccordion ────────────────────────────────────────────────────

interface Installment {
  id: string
  installment_no: number
  due_date: string
  total_amount: number
  status: 'pending' | 'paid' | 'overdue'
  paid_at: string | null
  paid_amount: number | null
}

function InstallmentsAccordion({ contractId, onReload }: { contractId: string; onReload: () => void }) {
  const [installments, setInstallments] = useState<Installment[]>([])
  const [loading, setLoading]           = useState(true)
  const [payingId, setPayingId]         = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    ;(supabase.from('installments') as any)
      .select('id, installment_no, due_date, total_amount, status, paid_at, paid_amount')
      .eq('contract_id', contractId)
      .order('installment_no', { ascending: true })
      .then(({ data }: any) => { setInstallments(data ?? []); setLoading(false) })
  }, [contractId])

  async function payInstallment(inst: Installment) {
    setPayingId(inst.id)
    const today = new Date().toISOString().split('T')[0]
    await (supabase.from('installments') as any)
      .update({ status: 'paid', paid_at: today, paid_amount: inst.total_amount })
      .eq('id', inst.id)
    setInstallments(prev => prev.map(i => i.id === inst.id ? { ...i, status: 'paid', paid_at: today, paid_amount: inst.total_amount } : i))
    setPayingId(null)
    onReload()
  }

  const statusColor = (status: string, due: string) => {
    if (status === 'paid') return 'text-emerald-600 bg-emerald-50'
    const today = new Date().toISOString().split('T')[0]
    if (due < today) return 'text-red-500 bg-red-50'
    return 'text-gray-500 bg-slate-100'
  }
  const statusLabel = (status: string, due: string) => {
    if (status === 'paid') return 'Paga'
    const today = new Date().toISOString().split('T')[0]
    if (due < today) return 'Vencida'
    return 'Pendente'
  }

  return (
    <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-3">
      {loading ? (
        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-gray-300" /></div>
      ) : installments.length === 0 ? (
        <p className="text-xs text-gray-400 py-2">Nenhuma parcela encontrada.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {installments.map(inst => {
            const isPaid = inst.status === 'paid'
            return (
              <div key={inst.id} className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 shadow-sm">
                <span className="text-xs font-bold text-gray-400 w-6 shrink-0">#{inst.installment_no}</span>
                <span className="text-xs text-gray-600 tabular-nums flex-1">
                  {new Date(inst.due_date + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: '2-digit' })}
                </span>
                <span className="text-xs font-semibold text-gray-900 tabular-nums">
                  {formatCurrency(inst.total_amount)}
                </span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColor(inst.status, inst.due_date)}`}>
                  {statusLabel(inst.status, inst.due_date)}
                </span>
                {!isPaid && (
                  <button
                    onClick={() => payInstallment(inst)}
                    disabled={payingId === inst.id}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg text-white transition-all disabled:opacity-50"
                    style={{ background: BRAND }}
                  >
                    {payingId === inst.id
                      ? <Loader2 className="w-3 h-3 animate-spin" />
                      : <CheckCheck className="w-3 h-3" />
                    }
                    Pagar
                  </button>
                )}
                {isPaid && inst.paid_at && (
                  <span className="text-[10px] text-gray-400 shrink-0">
                    {new Date(inst.paid_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ContractRow({ contract, onPayment, onDelete, onViewClient }: {
  contract: RecentContract
  onPayment: (contract: RecentContract) => void
  onDelete: (id: string) => Promise<void>
  onViewClient: (clientId: string, clientName: string) => void
}) {
  const [menuOpen, setMenuOpen]           = useState(false)
  const [menuPos, setMenuPos]             = useState({ top: 0, right: 0 })
  const [showConfirm, setShowConfirm]     = useState(false)
  const [settling, setSettling]           = useState(false)
  const [deleting, setDeleting]           = useState(false)
  const [showInstallments, setShowInstallments] = useState(false)
  const btnRef     = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const overdue = isOverdue(contract.first_due_date, contract.status)
  const canSettle  = contract.status === 'active' || contract.status === 'overdue'
  const isPaid     = contract.status === 'settled'
  const isArchived = contract.archived

  const installmentLabel = contract.payment_type === 'installments' && contract.installments > 1
    ? `${contract.installments}× parcelas`
    : 'Parcela única'

  const phone = contract.client_phone?.replace(/\D/g, '')
  const dueDateFormatted = contract.first_due_date
    ? new Date(contract.first_due_date + 'T00:00:00').toLocaleDateString('pt-BR')
    : ''
  const waMessage = encodeURIComponent(
    overdue
      ? `Olá, ${contract.client_name}! Tudo bem? 😊\n\nPassando para lembrá-lo(a) que identificamos uma pendência em seu contrato no valor de *${formatCurrency(contract.total_amount)}*, cujo vencimento foi em *${dueDateFormatted}*.\n\nPara evitar encargos adicionais, pedimos que entre em contato conosco o quanto antes para regularizarmos a situação.\n\nEstamos à disposição! 🤝`
      : `Olá, ${contract.client_name}! Tudo bem? 😊\n\nPassando para lembrá-lo(a) de que seu contrato no valor de *${formatCurrency(contract.total_amount)}* possui vencimento em *${dueDateFormatted}*.\n\nPara sua comodidade, lembre-se de efetuar o pagamento até essa data e evitar qualquer inconveniente.\n\nQualquer dúvida, estamos à disposição! 🤝`
  )
  const waLink = phone ? `https://api.whatsapp.com/send?phone=55${phone}&text=${waMessage}` : null

  // Close menu on outside click (works even through portal)
  useEffect(() => {
    if (!menuOpen) return
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      if (
        !btnRef.current?.contains(target) &&
        !dropdownRef.current?.contains(target)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  function settle() {
    setMenuOpen(false)
    onPayment(contract)
  }

  async function confirmDelete() {
    setShowConfirm(false)
    setDeleting(true)
    await onDelete(contract.id)
    setDeleting(false)
  }

  return (
    <>
      <div
        className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_140px_130px_110px_80px] gap-2 items-center px-6 py-4 hover:bg-slate-50/40 transition-colors border-l-[3px]"
        style={{
          borderLeftColor: isArchived || isPaid
            ? '#22C55E'
            : contract.status === 'overdue'
              ? '#EF4444'
              : contract.status === 'active'
                ? BRAND
                : '#94A3B8',
          opacity: isArchived ? 0.5 : isPaid ? 0.75 : 1,
        }}
      >
        {/* Cliente */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-white text-sm font-semibold shrink-0" style={{ background: BRAND + 'CC' }}>
            {getInitials(contract.client_name)}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{contract.client_name}</p>
            <div className="flex items-center gap-1.5 flex-wrap">
              <p className="text-xs text-gray-400">{formatDate(contract.contract_date)}</p>
              <ScoreBadge score={contract.client_score} />
            </div>
          </div>
        </div>

        {/* Valor / Parcelas */}
        <div className="hidden md:flex flex-col">
          <span className="text-sm font-semibold text-gray-900 tabular-nums">{formatCurrency(contract.total_amount)}</span>
          {contract.payment_type === 'installments' && contract.installments > 1 ? (
            <button
              onClick={() => setShowInstallments(v => !v)}
              className="flex items-center gap-0.5 text-xs text-teal-600 hover:text-teal-700 transition-colors w-fit"
            >
              <Layers className="w-3 h-3" />
              {installmentLabel}
              <ChevronDown className={`w-3 h-3 transition-transform ${showInstallments ? 'rotate-180' : ''}`} />
            </button>
          ) : (
            <span className="text-xs text-gray-400">{installmentLabel}</span>
          )}
        </div>

        {/* Vencimento */}
        <div className="hidden md:flex flex-col">
          {contract.first_due_date ? (
            <>
              <span className={`text-sm font-medium whitespace-nowrap ${overdue ? 'text-red-500' : 'text-gray-700'}`}>
                {formatDate(contract.first_due_date)}
              </span>
              <span className="text-[11px] text-red-400" style={{ visibility: overdue ? 'visible' : 'hidden' }}>Vencido</span>
            </>
          ) : (
            <span className="text-sm text-gray-300">—</span>
          )}
        </div>

        {/* Status badge */}
        <div className="hidden md:flex">
          <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${getStatusStyle(contract.status, contract.first_due_date)}`}>
            {getStatusLabel(contract.status, contract.first_due_date)}
          </span>
        </div>

        {/* Ações */}
        <div className="flex items-center justify-end md:justify-start gap-1.5">
          {/* Mobile: status badge inline */}
          <span className={`md:hidden text-xs font-semibold px-2.5 py-1 rounded-full ${getStatusStyle(contract.status, contract.first_due_date)}`}>
            {getStatusLabel(contract.status, contract.first_due_date)}
          </span>

          {/* WhatsApp */}
          {waLink && !isArchived && (
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              title="Enviar mensagem no WhatsApp"
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors bg-emerald-50 hover:bg-emerald-100 text-emerald-500"
            >
              <WhatsAppIcon className="w-4 h-4" />
            </a>
          )}

          {/* Três pontinhos */}
          <div className="relative">
            <button
              ref={btnRef}
              onClick={() => {
                if (menuOpen) { setMenuOpen(false); return }
                const rect = btnRef.current!.getBoundingClientRect()
                setMenuPos({
                  top:   rect.bottom + window.scrollY + 6,
                  right: window.innerWidth - rect.right,
                })
                setMenuOpen(true)
              }}
              disabled={settling || deleting}
              title="Mais opções"
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors bg-slate-100 hover:bg-slate-200 text-gray-500 disabled:opacity-50"
            >
              {settling || deleting
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <MoreHorizontal className="w-4 h-4" />
              }
            </button>

            {/* Dropdown via portal — escapa do overflow:hidden da tabela */}
            {menuOpen && createPortal(
              <div
                ref={dropdownRef}
                style={{ position: 'fixed', top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
                className="w-52 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 overflow-hidden"
              >
                {/* Registrar Pagamento */}
                {canSettle && !isArchived && (
                  <button
                    onClick={settle}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 transition-colors text-left"
                  >
                    <CheckCheck className="w-4 h-4 shrink-0" style={{ color: BRAND }} />
                    Registrar Pagamento
                  </button>
                )}

                {/* Visualizar Cliente */}
                <button
                  onClick={() => { setMenuOpen(false); onViewClient(contract.client_id, contract.client_name) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 transition-colors text-left"
                >
                  <Users className="w-4 h-4 shrink-0 text-violet-500" />
                  Visualizar Cliente
                </button>

                {/* Divider */}
                <div className="my-1 border-t border-slate-100" />

                {/* Arquivar / Excluir */}
                {!isArchived && (
                  <button
                    onClick={() => { setMenuOpen(false); setShowConfirm(true) }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors text-left"
                  >
                    <Trash2 className="w-4 h-4 shrink-0" />
                    {isPaid ? 'Arquivar contrato' : 'Excluir contrato'}
                  </button>
                )}
              </div>,
              document.body
            )}
          </div>
        </div>
      </div>

      {/* Accordion de parcelas */}
      {showInstallments && contract.payment_type === 'installments' && contract.installments > 1 && (
        <InstallmentsAccordion contractId={contract.id} onReload={() => {}} />
      )}

      {/* Modal de confirmação */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
          <div className="bg-white rounded-3xl shadow-xl p-8 w-full max-w-sm flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <div className="w-11 h-11 rounded-2xl bg-red-50 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mt-1">
                {isPaid ? 'Arquivar contrato?' : 'Excluir contrato?'}
              </h3>
              <p className="text-sm text-gray-500">
                {isPaid
                  ? 'O contrato será arquivado e ficará disponível no histórico de faturamento. Esta ação pode ser desfeita.'
                  : 'O contrato e suas parcelas serão excluídos permanentemente. Esta ação não pode ser desfeita.'}
              </p>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">
                {contract.client_name} · {formatCurrency(contract.total_amount)}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={confirmDelete}
                className="flex-1 py-3 rounded-2xl text-sm font-semibold text-white transition-colors"
                style={{ background: '#EF4444' }}
              >
                {isPaid ? 'Arquivar' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
      <div className="w-12 h-12 rounded-3xl flex items-center justify-center mb-1" style={{ background: '#4ABCB115' }}>
        <TrendingUp className="w-6 h-6" style={{ color: BRAND }} />
      </div>
      <p className="text-gray-900 font-semibold">Nenhum contrato ainda</p>
      <p className="text-gray-400 text-sm max-w-xs">Registre seu primeiro empréstimo agora.</p>
      <button onClick={onNew} className="mt-1 text-sm font-semibold hover:underline" style={{ color: BRAND }}>
        + Novo Contrato
      </button>
    </div>
  )
}

function MetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-3xl p-6 shadow-sm animate-pulse">
          <div className="w-10 h-10 rounded-2xl bg-slate-100 mb-4" />
          <div className="h-3 w-20 bg-slate-100 rounded-full mb-3" />
          <div className="h-7 w-24 bg-slate-100 rounded-full" />
        </div>
      ))}
    </div>
  )
}

function TableSkeleton() {
  return (
    <div className="divide-y divide-slate-50">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between px-6 py-4 animate-pulse">
          <div className="flex items-center gap-3.5">
            <div className="w-9 h-9 rounded-2xl bg-slate-100 shrink-0" />
            <div className="flex flex-col gap-2">
              <div className="h-3 w-28 bg-slate-100 rounded-full" />
              <div className="h-2.5 w-20 bg-slate-100 rounded-full" />
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="h-5 w-20 bg-slate-100 rounded-full" />
            <div className="h-3.5 w-16 bg-slate-100 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  )
}

function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
}

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 2)  return `(${digits}`
  if (digits.length <= 7)  return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
}

function addMonths(date: Date, n: number): Date {
  const d = new Date(date)
  d.setMonth(d.getMonth() + n)
  return d
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + n)
  return d
}

// ─── ContractTable (shared between Início and Contratos tabs) ─────────────────

function ContractTable({
  title, contracts, filteredContracts, loading, filter, setFilter,
  contractSearch, setContractSearch,
  dateFrom, dateTo, setDateFrom, setDateTo,
  clientFilter, clearClientFilter,
  onPayment, onDelete, onViewClient, onNew, archivedCount, allCount, showSearch,
}: {
  title: string
  contracts: RecentContract[]
  filteredContracts: RecentContract[]
  loading: boolean
  filter: ContractFilter
  setFilter: (f: ContractFilter) => void
  contractSearch: string
  setContractSearch: (v: string) => void
  dateFrom?: string
  dateTo?: string
  setDateFrom?: (v: string) => void
  setDateTo?: (v: string) => void
  clientFilter: { id: string; name: string } | null
  clearClientFilter: () => void
  onPayment: (contract: RecentContract) => void
  onDelete: (id: string) => Promise<void>
  onViewClient: (clientId: string, clientName: string) => void
  onNew: () => void
  archivedCount: number
  allCount?: number
  showSearch: boolean
}) {
  const hasDateFilter = !!(dateFrom || dateTo)
  const hasActiveFilters = !!(contractSearch || hasDateFilter || clientFilter)

  function clearAllFilters() {
    setContractSearch('')
    setDateFrom?.('')
    setDateTo?.('')
    clearClientFilter()
    setFilter('all')
  }

  return (
    <div className="bg-white rounded-[32px] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex flex-col gap-3 px-6 py-5 border-b border-slate-100">

        {/* Title + filter tabs */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { id: 'all',      label: 'Todos',      count: allCount ?? null },
              { id: 'active',   label: 'Pendentes',  count: contracts.filter(c => c.status === 'active' && !isOverdue(c.first_due_date, c.status)).length },
              { id: 'overdue',  label: 'Atrasados',  count: contracts.filter(c => (c.status === 'active' || c.status === 'overdue') && isOverdue(c.first_due_date, c.status)).length },
              { id: 'archived', label: 'Arquivados', count: archivedCount },
            ] as { id: ContractFilter; label: string; count: number | null }[]).map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  filter === f.id ? 'text-white' : 'bg-slate-100 text-gray-500 hover:bg-slate-200'
                }`}
                style={filter === f.id
                  ? { background: f.id === 'overdue' ? '#EF4444' : f.id === 'archived' ? '#64748B' : BRAND }
                  : {}}
              >
                {f.label}
                {f.count !== null && (
                  <span className={`ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] ${
                    filter === f.id ? 'bg-white/25 text-white' : 'bg-white text-gray-400'
                  }`}>
                    {f.count}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Search + date range */}
        {showSearch && (
          <div className="flex flex-wrap items-center gap-2">
            {/* Search input */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={contractSearch}
                onChange={e => setContractSearch(e.target.value)}
                placeholder="Buscar por nome ou valor..."
                className={`${inputCls} pl-10 pr-4 py-2.5 text-sm`}
              />
              {contractSearch && (
                <button
                  onClick={() => setContractSearch('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Date range — only when component has setDateFrom/setDateTo */}
            {setDateFrom && setDateTo && (
              <div className="flex items-center gap-1.5">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="date"
                    value={dateFrom ?? ''}
                    onChange={e => setDateFrom(e.target.value)}
                    className={`${inputCls} pl-8 pr-3 py-2.5 text-sm w-[148px]`}
                    title="Data de início"
                  />
                </div>
                <span className="text-gray-400 text-xs font-medium shrink-0">até</span>
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="date"
                    value={dateTo ?? ''}
                    onChange={e => setDateTo(e.target.value)}
                    className={`${inputCls} pl-8 pr-3 py-2.5 text-sm w-[148px]`}
                    title="Data de fim"
                  />
                </div>
                {hasDateFilter && (
                  <button
                    onClick={() => { setDateFrom(''); setDateTo('') }}
                    className="text-gray-400 hover:text-red-400 transition-colors p-1"
                    title="Limpar datas"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Active filter chips */}
        {(clientFilter || hasActiveFilters) && (
          <div className="flex items-center gap-2 flex-wrap">
            {clientFilter && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium" style={{ background: '#4ABCB115', color: BRAND }}>
                <History className="w-3 h-3" />
                Histórico: {clientFilter.name}
                <button onClick={clearClientFilter} className="ml-0.5 hover:opacity-70">
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-red-400 transition-colors px-2 py-1.5 rounded-xl hover:bg-red-50"
              >
                <X className="w-3 h-3" />
                Limpar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {loading ? <TableSkeleton /> : filteredContracts.length === 0 ? (
        contracts.length === 0
          ? <EmptyState onNew={onNew} />
          : (
            <div className="flex flex-col items-center justify-center py-14 gap-2 text-center px-6">
              <p className="text-gray-500 font-medium text-sm">Nenhum contrato encontrado</p>
              <button onClick={clearAllFilters} className="text-sm font-semibold hover:underline" style={{ color: BRAND }}>
                Limpar filtros
              </button>
            </div>
          )
      ) : (
        <>
          <div className="hidden md:grid grid-cols-[1fr_140px_130px_110px_96px] gap-2 px-6 py-3 border-b border-slate-50">
            {['Cliente', 'Valor / Parcelas', 'Vencimento', 'Status', 'Ações'].map(h => (
              <span key={h} className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{h}</span>
            ))}
          </div>
          <div>
            {filteredContracts.map(c => (
              <ContractRow key={c.id} contract={c} onPayment={onPayment} onDelete={onDelete} onViewClient={onViewClient} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── AfiliadosView ───────────────────────────────────────────────────────────

const CASHBACK_PER_CONVERSION = 10
const MIN_WITHDRAWAL = 50

interface Referral {
  id: string
  referred_email: string | null
  status: 'pending' | 'converted'
  cashback_amount: number
  converted_at: string | null
  created_at: string
}

interface Withdrawal {
  id: string
  amount: number
  pix_key: string
  status: 'pending' | 'approved' | 'paid' | 'rejected'
  requested_at: string
  processed_at: string | null
  notes: string | null
}

function AfiliadosView() {
  const [affiliateCode, setAffiliateCode] = useState<string | null>(null)
  const [referrals, setReferrals]         = useState<Referral[]>([])
  const [withdrawals, setWithdrawals]     = useState<Withdrawal[]>([])
  const [loading, setLoading]             = useState(true)
  const [copied, setCopied]               = useState(false)
  const [showWithdrawForm, setShowWithdrawForm] = useState(false)
  const [pixKey, setPixKey]               = useState('')
  const [withdrawing, setWithdrawing]     = useState(false)
  const [wError, setWError]               = useState<string | null>(null)
  const [wSuccess, setWSuccess]           = useState(false)

  const affiliateLink = affiliateCode
    ? `${window.location.origin}/?ref=${affiliateCode}`
    : ''

  const convertedCount  = referrals.filter(r => r.status === 'converted').length
  const pendingCount    = referrals.filter(r => r.status === 'pending').length
  const totalEarned     = referrals.filter(r => r.status === 'converted').reduce((s, r) => s + r.cashback_amount, 0)
  const withdrawn       = withdrawals.filter(w => w.status === 'paid').reduce((s, w) => s + w.amount, 0)
  const pendingWithdraw = withdrawals.filter(w => w.status === 'pending' || w.status === 'approved').reduce((s, w) => s + w.amount, 0)
  const available       = Math.max(0, totalEarned - withdrawn - pendingWithdraw)
  const canWithdraw     = available >= MIN_WITHDRAWAL

  useEffect(() => { loadAffiliate() }, [])

  async function loadAffiliate() {
    setLoading(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // Get or create affiliate code
      let { data: codeRow } = await (supabase.from('affiliate_codes') as any)
        .select('code')
        .eq('user_id', user.id)
        .single()

      if (!codeRow) {
        const code = Math.random().toString(36).substring(2, 8).toUpperCase()
        const { data: newCode } = await (supabase.from('affiliate_codes') as any)
          .insert({ user_id: user.id, code })
          .select('code')
          .single()
        codeRow = newCode
      }
      setAffiliateCode(codeRow?.code ?? null)

      // Load referrals
      const { data: refs } = await (supabase.from('referrals') as any)
        .select('id, referred_email, status, cashback_amount, converted_at, created_at')
        .eq('affiliate_user_id', user.id)
        .order('created_at', { ascending: false })
      setReferrals(refs ?? [])

      // Load withdrawals
      const { data: wds } = await (supabase.from('cashback_withdrawals') as any)
        .select('id, amount, pix_key, status, requested_at, processed_at, notes')
        .eq('user_id', user.id)
        .order('requested_at', { ascending: false })
      setWithdrawals(wds ?? [])
    } catch (e) { console.error('[loadAffiliate]', e) }
    setLoading(false)
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(affiliateLink)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleWithdraw() {
    setWError(null)
    if (!pixKey.trim()) { setWError('Informe sua chave Pix.'); return }
    if (!canWithdraw) { setWError(`Saldo mínimo para resgate é ${formatCurrency(MIN_WITHDRAWAL)}.`); return }
    setWithdrawing(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error } = await (supabase.from('cashback_withdrawals') as any).insert({
      user_id: user!.id,
      amount:  available,
      pix_key: pixKey.trim(),
      status:  'pending',
    })
    setWithdrawing(false)
    if (error) { setWError(error.message); return }
    setWSuccess(true)
    setShowWithdrawForm(false)
    setPixKey('')
    loadAffiliate()
  }

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
    </div>
  )

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Programa de Afiliados</h1>
          <p className="text-gray-400 text-sm mt-0.5">Indique o Factoring e ganhe R$ {CASHBACK_PER_CONVERSION} por cada plano assinado</p>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-3xl p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Indicados</p>
          <p className="text-2xl font-bold text-gray-900">{referrals.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">{pendingCount} aguardando</p>
        </div>
        <div className="bg-white rounded-3xl p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Convertidos</p>
          <p className="text-2xl font-bold text-emerald-600">{convertedCount}</p>
          <p className="text-xs text-gray-400 mt-0.5">assinaram um plano</p>
        </div>
        <div className="bg-white rounded-3xl p-5 shadow-sm">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Total ganho</p>
          <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalEarned)}</p>
          <p className="text-xs text-gray-400 mt-0.5">acumulado</p>
        </div>
        <div className="bg-white rounded-3xl p-5 shadow-sm border-2" style={{ borderColor: available >= MIN_WITHDRAWAL ? '#4ABCB1' : '#e2e8f0' }}>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-1">Disponível</p>
          <p className="text-2xl font-bold" style={{ color: available >= MIN_WITHDRAWAL ? '#4ABCB1' : '#111827' }}>{formatCurrency(available)}</p>
          <p className="text-xs text-gray-400 mt-0.5">mínimo {formatCurrency(MIN_WITHDRAWAL)}</p>
        </div>
      </div>

      {/* Link de indicação */}
      <div className="bg-white rounded-3xl p-5 shadow-sm mb-6">
        <p className="text-sm font-semibold text-gray-700 mb-3">Seu link de indicação</p>
        <div className="flex gap-2">
          <div className="flex-1 bg-slate-50 rounded-2xl px-4 py-3 text-sm text-gray-600 font-mono truncate border border-slate-200">
            {affiliateLink}
          </div>
          <button
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-3 rounded-2xl text-white text-sm font-semibold transition-all active:scale-[0.98] shrink-0"
            style={{ background: BRAND }}
          >
            {copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">
          Compartilhe este link. Quando seu indicado assinar um plano, você recebe <strong className="text-gray-600">R$ {CASHBACK_PER_CONVERSION},00</strong> automaticamente.
        </p>
      </div>

      {/* Resgate */}
      <div className="bg-white rounded-3xl p-5 shadow-sm mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-sm font-semibold text-gray-700">Resgatar cashback</p>
            <p className="text-xs text-gray-400 mt-0.5">Saldo disponível: {formatCurrency(available)}</p>
          </div>
          {!showWithdrawForm && (
            <button
              onClick={() => { setShowWithdrawForm(true); setWSuccess(false) }}
              disabled={!canWithdraw}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold transition-all disabled:opacity-40"
              style={{ background: canWithdraw ? BRAND : '#e2e8f0', color: canWithdraw ? 'white' : '#94a3b8' }}
            >
              <ArrowDownCircle className="w-4 h-4" />
              Resgatar via Pix
            </button>
          )}
        </div>

        {wSuccess && (
          <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3 mb-3">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <p className="text-sm text-emerald-700">Solicitação enviada! Processaremos em até 2 dias úteis.</p>
          </div>
        )}

        {showWithdrawForm && (
          <div className="flex flex-col gap-3 border-t border-slate-100 pt-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 mb-1.5 block">Chave Pix</label>
              <input
                autoFocus
                type="text"
                value={pixKey}
                onChange={e => setPixKey(e.target.value)}
                placeholder="CPF, e-mail, telefone ou chave aleatória"
                className="w-full px-4 py-3 border border-gray-200 rounded-2xl text-sm text-gray-900 focus:outline-none focus:border-[#4ABCB1] focus:ring-4 focus:ring-[#4ABCB115] transition-all"
              />
            </div>
            <div className="bg-slate-50 rounded-2xl px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Valor do resgate</span>
                <span className="font-bold text-gray-900">{formatCurrency(available)}</span>
              </div>
            </div>
            {wError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <p className="text-sm text-red-500">{wError}</p>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => { setShowWithdrawForm(false); setWError(null) }}
                className="flex-1 py-2.5 rounded-2xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-slate-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="flex-1 py-2.5 rounded-2xl text-white text-sm font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                style={{ background: BRAND }}
              >
                {withdrawing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowDownCircle className="w-4 h-4" />}
                {withdrawing ? 'Enviando...' : 'Confirmar resgate'}
              </button>
            </div>
          </div>
        )}

        {/* Histórico de resgates */}
        {withdrawals.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Histórico de resgates</p>
            <div className="flex flex-col gap-2">
              {withdrawals.map(w => (
                <div key={w.id} className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{formatCurrency(w.amount)}</p>
                    <p className="text-xs text-gray-400 truncate">Pix: {w.pix_key}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                      w.status === 'paid'     ? 'bg-emerald-50 text-emerald-600' :
                      w.status === 'rejected' ? 'bg-red-50 text-red-500' :
                      w.status === 'approved' ? 'bg-blue-50 text-blue-500' :
                                                'bg-amber-50 text-amber-600'
                    }`}>
                      {w.status === 'paid' ? 'Pago' : w.status === 'rejected' ? 'Rejeitado' : w.status === 'approved' ? 'Aprovado' : 'Pendente'}
                    </span>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {new Date(w.requested_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Lista de indicados */}
      <div className="bg-white rounded-3xl shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <p className="text-sm font-semibold text-gray-700">Seus indicados</p>
        </div>
        {referrals.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-4">
            <div className="w-14 h-14 rounded-3xl bg-slate-100 flex items-center justify-center">
              <Gift className="w-7 h-7 text-slate-400" />
            </div>
            <p className="text-gray-500 font-medium">Nenhum indicado ainda</p>
            <p className="text-gray-400 text-sm">Compartilhe seu link e ganhe R$ {CASHBACK_PER_CONVERSION} por cada plano assinado.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {referrals.map(r => (
              <div key={r.id} className="flex items-center gap-3 px-5 py-3.5">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: BRAND + 'CC' }}>
                  {(r.referred_email ?? '?').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{r.referred_email ?? '—'}</p>
                  <p className="text-xs text-gray-400">
                    {new Date(r.created_at).toLocaleDateString('pt-BR')}
                    {r.converted_at && ` · convertido em ${new Date(r.converted_at).toLocaleDateString('pt-BR')}`}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  {r.status === 'converted' && (
                    <span className="text-xs font-semibold text-emerald-600">+{formatCurrency(r.cashback_amount)}</span>
                  )}
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                    r.status === 'converted' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                  }`}>
                    {r.status === 'converted' ? 'Convertido' : 'Pendente'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MovimentacoesView ────────────────────────────────────────────────────────

type MovFilter = 'todas' | 'entradas' | 'saidas'

function exportMovimentacoesPDF(movimentacoes: Movimentacao[], filter: MovFilter, dateFrom: string, dateTo: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 15
  let y = margin

  // Header
  doc.setFillColor(74, 188, 177)
  doc.rect(0, 0, pageW, 28, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.text('Relatório de Movimentações', margin, 12)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  const rangeLabel = dateFrom || dateTo
    ? `Período: ${dateFrom ? new Date(dateFrom + 'T00:00:00').toLocaleDateString('pt-BR') : '—'} a ${dateTo ? new Date(dateTo + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}`
    : `Gerado em: ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`
  doc.text(rangeLabel, margin, 21)
  doc.text(`Filtro: ${filter === 'todas' ? 'Todas' : filter === 'entradas' ? 'Entradas' : 'Saídas'}`, pageW - margin, 21, { align: 'right' })

  y = 36
  doc.setTextColor(30, 30, 30)

  // Totais
  const totalE = movimentacoes.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0)
  const totalS = movimentacoes.filter(m => m.tipo === 'saida').reduce((s, m)   => s + m.valor, 0)
  const saldo  = totalE - totalS

  doc.setFillColor(248, 250, 252)
  doc.roundedRect(margin, y, pageW - margin * 2, 18, 3, 3, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(16, 185, 129)
  doc.text(`Entradas: ${formatCurrency(totalE)}`, margin + 6, y + 7)
  doc.setTextColor(239, 68, 68)
  doc.text(`Saídas: ${formatCurrency(totalS)}`, margin + 70, y + 7)
  doc.setTextColor(saldo >= 0 ? 15 : 239, saldo >= 0 ? 118 : 68, saldo >= 0 ? 110 : 68)
  doc.text(`Saldo: ${formatCurrency(saldo)}`, margin + 140, y + 7)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(150, 150, 150)
  doc.text(`Total de lançamentos: ${movimentacoes.length}`, margin + 6, y + 13)
  y += 24

  // Cabeçalho da tabela
  doc.setFillColor(74, 188, 177)
  doc.rect(margin, y, pageW - margin * 2, 7, 'F')
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(255, 255, 255)
  doc.text('Data',        margin + 2, y + 5)
  doc.text('Tipo',        margin + 22, y + 5)
  doc.text('Descrição',   margin + 38, y + 5)
  doc.text('Obs.',        margin + 110, y + 5)
  doc.text('Valor',       pageW - margin - 2, y + 5, { align: 'right' })
  y += 9

  // Linhas
  let rowBg = false
  for (const m of movimentacoes) {
    if (y > 270) {
      doc.addPage()
      y = margin
    }
    if (rowBg) {
      doc.setFillColor(248, 250, 252)
      doc.rect(margin, y - 1, pageW - margin * 2, 7, 'F')
    }
    rowBg = !rowBg

    const dateStr = m.data ? new Date(m.data + 'T00:00:00').toLocaleDateString('pt-BR') : '—'
    const desc = (m.client_name + (m.descricao ? ' — ' + m.descricao : '')).slice(0, 50)
    const obs  = (m.observacoes ?? '').slice(0, 30)

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(80, 80, 80)
    doc.text(dateStr, margin + 2, y + 4)
    doc.setTextColor(m.tipo === 'entrada' ? 16 : 239, m.tipo === 'entrada' ? 185 : 68, m.tipo === 'entrada' ? 129 : 68)
    doc.text(m.tipo === 'entrada' ? 'Entrada' : 'Saída', margin + 22, y + 4)
    doc.setTextColor(60, 60, 60)
    doc.text(desc, margin + 38, y + 4)
    doc.setTextColor(120, 120, 120)
    doc.text(obs, margin + 110, y + 4)
    doc.setTextColor(m.tipo === 'entrada' ? 16 : 239, m.tipo === 'entrada' ? 185 : 68, m.tipo === 'entrada' ? 129 : 68)
    doc.setFont('helvetica', 'bold')
    doc.text(`${m.tipo === 'entrada' ? '+' : '-'}${formatCurrency(m.valor)}`, pageW - margin - 2, y + 4, { align: 'right' })
    y += 7
  }

  // Footer
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(180, 180, 180)
  doc.text('Gerado por Factoring · Sistema de Gestão de Empréstimos', pageW / 2, 290, { align: 'center' })

  doc.save(`movimentacoes_${new Date().toISOString().split('T')[0]}.pdf`)
}

function generateReciboPDF(contract: RecentContract, amount: number, mode: string, payDate: string) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a5' })
  const pageW = doc.internal.pageSize.getWidth()
  const m = 16

  // Topo colorido
  doc.setFillColor(74, 188, 177)
  doc.rect(0, 0, pageW, 32, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('RECIBO DE PAGAMENTO', pageW / 2, 13, { align: 'center' })
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('Factoring · Sistema de Gestão de Empréstimos', pageW / 2, 21, { align: 'center' })

  let y = 42
  doc.setTextColor(30, 30, 30)

  // Número do contrato + data
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(100, 100, 100)
  doc.text(`Contrato Nº ${contract.contract_number ?? contract.id.slice(0, 8).toUpperCase()}`, m, y)
  doc.text(`Data: ${new Date(payDate + 'T00:00:00').toLocaleDateString('pt-BR')}`, pageW - m, y, { align: 'right' })
  y += 10

  // Linha divisória
  doc.setDrawColor(230, 230, 230)
  doc.line(m, y, pageW - m, y)
  y += 8

  // Cliente
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text('Pagador:', m, y)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text(contract.client_name, m + 22, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text('Tipo de pagamento:', m, y)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  const modeLabel = mode === 'integral' ? 'Quitação total' : mode === 'interest_only' ? 'Pagamento de juros' : 'Pagamento parcial'
  doc.text(modeLabel, m + 40, y)
  y += 8

  doc.setFont('helvetica', 'normal')
  doc.setTextColor(80, 80, 80)
  doc.text('Valor contrato:', m, y)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text(formatCurrency(contract.total_amount), m + 35, y)
  y += 12

  // Linha divisória
  doc.line(m, y, pageW - m, y)
  y += 10

  // Valor em destaque
  doc.setFillColor(240, 253, 250)
  doc.roundedRect(m, y, pageW - m * 2, 20, 3, 3, 'F')
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 100, 100)
  doc.text('VALOR RECEBIDO', pageW / 2, y + 7, { align: 'center' })
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(16, 185, 129)
  doc.text(formatCurrency(amount), pageW / 2, y + 16, { align: 'center' })
  y += 28

  // Rodapé
  doc.setFontSize(7)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(160, 160, 160)
  doc.text(`Gerado em ${new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}`, pageW / 2, y + 8, { align: 'center' })
  doc.text('Este documento comprova o recebimento do valor acima especificado.', pageW / 2, y + 14, { align: 'center' })

  doc.save(`recibo_${contract.contract_number ?? contract.id.slice(0, 8)}_${payDate}.pdf`)
}

function MovimentacoesView({
  movimentacoes, loading, onReload,
}: {
  movimentacoes: Movimentacao[]
  loading: boolean
  onReload: () => void
}) {
  const [filter, setFilter] = useState<MovFilter>('todas')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo]     = useState('')
  const [showManualModal, setShowManualModal] = useState(false)

  const filtered = movimentacoes
    .filter(m => filter === 'todas' || m.tipo === (filter === 'entradas' ? 'entrada' : 'saida'))
    .filter(m => !search || m.client_name.toLowerCase().includes(search.toLowerCase()) || (m.descricao ?? '').toLowerCase().includes(search.toLowerCase()))
    .filter(m => (!dateFrom || m.data >= dateFrom) && (!dateTo || m.data <= dateTo))

  const totalEntradas = filtered.filter(m => m.tipo === 'entrada').reduce((s, m) => s + m.valor, 0)
  const totalSaidas   = filtered.filter(m => m.tipo === 'saida').reduce((s, m)   => s + m.valor, 0)

  function groupByMonth(list: Movimentacao[]) {
    const groups: { month: string; items: Movimentacao[] }[] = []
    list.forEach(m => {
      const month = m.data ? new Date(m.data + 'T00:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }) : 'Sem data'
      const last = groups[groups.length - 1]
      if (last && last.month === month) last.items.push(m)
      else groups.push({ month, items: [m] })
    })
    return groups
  }

  const groups = groupByMonth(filtered)

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Movimentações</h1>
          <p className="text-gray-400 text-sm mt-0.5">Histórico de entradas e saídas</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportMovimentacoesPDF(filtered, filter, dateFrom, dateTo)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl border border-slate-200 bg-white text-gray-600 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            <FileDown className="w-4 h-4" />
            Exportar PDF
          </button>
          <button
            onClick={() => setShowManualModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl text-white text-sm font-semibold transition-all active:scale-[0.98]"
            style={{ background: BRAND }}
          >
            <Plus className="w-4 h-4" />
            Lançamento
          </button>
          <button
            onClick={onReload}
            className="p-2.5 rounded-2xl border border-slate-200 bg-white text-gray-400 hover:text-gray-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-3xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Entradas</p>
          </div>
          <p className="text-xl font-bold text-emerald-600 mt-1">{formatCurrency(totalEntradas)}</p>
        </div>
        <div className="bg-white rounded-3xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-red-400" />
            </div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Saídas</p>
          </div>
          <p className="text-xl font-bold text-red-500 mt-1">{formatCurrency(totalSaidas)}</p>
        </div>
        <div className="bg-white rounded-3xl p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: BRAND + '18' }}>
              <Wallet className="w-4 h-4" style={{ color: BRAND }} />
            </div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Saldo</p>
          </div>
          <p className={`text-xl font-bold mt-1 ${totalEntradas - totalSaidas >= 0 ? 'text-gray-900' : 'text-red-500'}`}>
            {formatCurrency(totalEntradas - totalSaidas)}
          </p>
        </div>
      </div>

      {/* Filtros de tipo */}
      <div className="flex gap-2 mb-4">
        {([
          { id: 'todas',    label: 'Todas' },
          { id: 'entradas', label: 'Entradas' },
          { id: 'saidas',   label: 'Saídas' },
        ] as { id: MovFilter; label: string }[]).map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-4 py-2 rounded-2xl text-sm font-medium transition-all ${
              filter === tab.id ? 'text-white' : 'bg-white text-gray-500 hover:bg-slate-50 border border-slate-100'
            }`}
            style={filter === tab.id ? { background: BRAND } : {}}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Busca + filtro de data */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por descrição ou cliente..."
            className={`${inputCls} pl-10 pr-4 py-2.5`}
          />
        </div>
        <div className="relative">
          <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className={`${inputCls} pl-10 pr-3 py-2.5 w-40`} />
        </div>
        <div className="relative">
          <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className={`${inputCls} pl-10 pr-3 py-2.5 w-40`} />
        </div>
      </div>

      {/* Lista agrupada por mês */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-14 h-14 rounded-3xl bg-slate-100 flex items-center justify-center">
            <History className="w-7 h-7 text-slate-400" />
          </div>
          <p className="text-gray-500 font-medium">Nenhuma movimentação encontrada</p>
          <p className="text-gray-400 text-sm">Tente ajustar os filtros.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(group => (
            <div key={group.month}>
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 capitalize">
                {group.month}
              </p>
              <div className="flex flex-col gap-2">
                {group.items.map(mov => (
                  <MovimentacaoRow key={mov.id} mov={mov} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de lançamento manual */}
      {showManualModal && (
        <ManualMovModal
          onClose={() => setShowManualModal(false)}
          onSaved={() => { setShowManualModal(false); onReload() }}
        />
      )}
    </div>
  )
}

function MovimentacaoRow({ mov }: { mov: Movimentacao }) {
  const isEntrada = mov.tipo === 'entrada'
  const [expanded, setExpanded] = useState(false)
  const dateStr = mov.data
    ? new Date(mov.data + 'T00:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    : '—'

  return (
    <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <div
        className={`px-4 py-3.5 flex items-center gap-4 ${mov.observacoes ? 'cursor-pointer hover:bg-slate-50/60 transition-colors' : ''}`}
        onClick={() => mov.observacoes && setExpanded(e => !e)}
      >
        {/* Ícone tipo */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
          isEntrada ? 'bg-emerald-50' : 'bg-red-50'
        }`}>
          {isEntrada
            ? <ArrowUpCircle className="w-4 h-4 text-emerald-500" />
            : <ArrowDownCircle className="w-4 h-4 text-red-400" />
          }
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-semibold text-gray-900 text-sm truncate">{mov.client_name}</p>
            {mov.manual && (
              <span className="inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded-md bg-violet-50 text-violet-500">
                <StickyNote className="w-2.5 h-2.5" />
                Manual
              </span>
            )}
            {mov.observacoes && (
              <StickyNote className="w-3 h-3 text-amber-400 shrink-0" />
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-gray-400 truncate">{mov.descricao}</span>
            {mov.contract_number && (
              <span className="text-xs text-gray-300 flex items-center gap-0.5 shrink-0">
                <Hash className="w-2.5 h-2.5" />{mov.contract_number}
              </span>
            )}
          </div>
        </div>

        {/* Valor + data */}
        <div className="text-right shrink-0">
          <p className={`font-bold text-sm ${isEntrada ? 'text-emerald-600' : 'text-red-500'}`}>
            {isEntrada ? '+' : '-'}{formatCurrency(mov.valor)}
          </p>
          <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
        </div>
      </div>

      {/* Observações expandidas */}
      {expanded && mov.observacoes && (
        <div className="px-4 pb-3.5 flex items-start gap-2 border-t border-slate-50">
          <StickyNote className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-2" />
          <p className="text-sm text-gray-500 leading-relaxed pt-2 whitespace-pre-wrap">{mov.observacoes}</p>
        </div>
      )}
    </div>
  )
}

// ─── ManualMovModal ────────────────────────────────────────────────────────────

function ManualMovModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [tipo, setTipo]         = useState<'entrada' | 'saida'>('entrada')
  const [valor, setValor]       = useState('')
  const [data, setData]         = useState(new Date().toISOString().split('T')[0])
  const [descricao, setDescricao]     = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    const v = parseFloat(valor.replace(',', '.'))
    if (!valor || isNaN(v) || v <= 0) { setError('Informe um valor válido.'); return }
    if (!data) { setError('Informe a data.'); return }
    if (!descricao.trim()) { setError('Informe uma descrição.'); return }

    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const { error: err } = await (supabase.from('manual_transactions') as any).insert({
      user_id:    user!.id,
      tipo,
      valor:      v,
      data,
      descricao:  descricao.trim(),
      observacoes: observacoes.trim(),
    })
    setSaving(false)
    if (err) { setError(err.message); return }
    onSaved()
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <h2 className="text-base font-bold text-gray-900">Novo Lançamento</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-slate-100 flex items-center justify-center transition-colors">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 flex flex-col gap-4">
          {/* Tipo toggle */}
          <div className="flex rounded-2xl overflow-hidden border border-slate-200">
            <button
              onClick={() => setTipo('entrada')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all ${
                tipo === 'entrada' ? 'bg-emerald-500 text-white' : 'text-gray-500 hover:bg-slate-50'
              }`}
            >
              <ArrowUpCircle className="w-4 h-4" />
              Entrada
            </button>
            <button
              onClick={() => setTipo('saida')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold transition-all ${
                tipo === 'saida' ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-slate-50'
              }`}
            >
              <ArrowDownCircle className="w-4 h-4" />
              Saída
            </button>
          </div>

          {/* Valor */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Valor (R$)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={valor}
              onChange={e => setValor(e.target.value)}
              placeholder="0,00"
              className={`${inputCls} py-2.5 px-3.5`}
            />
          </div>

          {/* Data */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Data</label>
            <input
              type="date"
              value={data}
              onChange={e => setData(e.target.value)}
              className={`${inputCls} py-2.5 px-3.5`}
            />
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Descrição <span className="text-red-400">*</span></label>
            <input
              type="text"
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Ex: Retirada para despesas pessoais"
              className={`${inputCls} py-2.5 px-3.5`}
            />
          </div>

          {/* Observações */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1.5">
              <StickyNote className="w-3.5 h-3.5 text-amber-400" />
              Observações (opcional)
            </label>
            <textarea
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              placeholder="Detalhe o motivo, origem ou qualquer observação relevante..."
              rows={3}
              className={`${inputCls} py-2.5 px-3.5 resize-none`}
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-5 border-t border-slate-100">
          <button
            onClick={onClose}
            className="flex-1 py-3 rounded-2xl border border-gray-200 text-gray-500 text-sm font-medium hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex-1 py-3 rounded-2xl text-white text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 ${
              tipo === 'entrada' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-red-500 hover:bg-red-600'
            }`}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (tipo === 'entrada' ? <ArrowUpCircle className="w-4 h-4" /> : <ArrowDownCircle className="w-4 h-4" />)}
            {saving ? 'Salvando...' : 'Salvar Lançamento'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── ContasAReceberView ───────────────────────────────────────────────────────

type ContasFilter = 'todas' | 'hoje' | 'amanha' | 'semana' | 'atrasadas'

function ContasAReceberView({
  contracts, loading, onPayment,
}: {
  contracts: RecentContract[]
  loading: boolean
  onPayment: (contract: RecentContract) => void
}) {
  const [filter, setFilter] = useState<ContasFilter>('todas')
  const [search, setSearch] = useState('')

  const today    = new Date(); today.setHours(0, 0, 0, 0)
  const todayStr = today.toISOString().split('T')[0]

  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().split('T')[0]

  const weekEnd = new Date(today); weekEnd.setDate(weekEnd.getDate() + 7)
  const weekEndStr = weekEnd.toISOString().split('T')[0]

  // Only active/overdue contracts
  const pending = contracts.filter(c => c.status === 'active' || c.status === 'overdue')

  const counts: Record<ContasFilter, number> = {
    todas:    pending.length,
    hoje:     pending.filter(c => c.first_due_date === todayStr).length,
    amanha:   pending.filter(c => c.first_due_date === tomorrowStr).length,
    semana:   pending.filter(c => !!c.first_due_date && c.first_due_date >= todayStr && c.first_due_date <= weekEndStr).length,
    atrasadas: pending.filter(c => isOverdue(c.first_due_date, c.status)).length,
  }

  const filtered = pending
    .filter(c => {
      if (filter === 'hoje')     return c.first_due_date === todayStr
      if (filter === 'amanha')   return c.first_due_date === tomorrowStr
      if (filter === 'semana')   return !!c.first_due_date && c.first_due_date >= todayStr && c.first_due_date <= weekEndStr
      if (filter === 'atrasadas') return isOverdue(c.first_due_date, c.status)
      return true
    })
    .filter(c => !search || c.client_name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      const aOver = isOverdue(a.first_due_date, a.status)
      const bOver = isOverdue(b.first_due_date, b.status)
      if (aOver !== bOver) return aOver ? -1 : 1
      return (a.first_due_date ?? '').localeCompare(b.first_due_date ?? '')
    })

  const totalPendente = filtered.reduce((s, c) => s + Math.max(0, c.total_amount - c.paid_amount), 0)
  const totalAtrasado = filtered.filter(c => isOverdue(c.first_due_date, c.status))
    .reduce((s, c) => s + Math.max(0, c.total_amount - c.paid_amount), 0)

  const filterTabs: { id: ContasFilter; label: string }[] = [
    { id: 'todas',     label: 'Todas' },
    { id: 'hoje',      label: 'Hoje' },
    { id: 'amanha',    label: 'Amanhã' },
    { id: 'semana',    label: 'Esta Semana' },
    { id: 'atrasadas', label: 'Atrasadas' },
  ]

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Contas a Receber</h1>
          <p className="text-gray-400 text-sm mt-0.5">Gerencie os recebimentos pendentes</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Total a Receber</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 mt-2">{formatCurrency(totalPendente)}</p>
          <p className="text-xs text-gray-400 mt-1">{filtered.length} contrato{filtered.length !== 1 ? 's' : ''} na seleção</p>
        </div>
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-red-50 flex items-center justify-center">
              <AlertCircle className="w-4 h-4 text-red-400" />
            </div>
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Atrasadas</p>
          </div>
          <p className="text-2xl font-bold text-red-500 mt-2">{formatCurrency(totalAtrasado)}</p>
          <p className="text-xs text-gray-400 mt-1">{counts.atrasadas} contrato{counts.atrasadas !== 1 ? 's' : ''} vencido{counts.atrasadas !== 1 ? 's' : ''}</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por cliente..."
          className={`${inputCls} pl-10 pr-4 py-3`}
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-1">
        {filterTabs.map(tab => {
          const active = filter === tab.id
          const isAlert = tab.id === 'atrasadas' && counts.atrasadas > 0
          return (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-2xl text-sm font-medium whitespace-nowrap transition-all ${
                active
                  ? isAlert ? 'bg-red-500 text-white' : 'text-white'
                  : isAlert ? 'bg-red-50 text-red-500 hover:bg-red-100' : 'bg-white text-gray-500 hover:bg-slate-50 border border-slate-100'
              }`}
              style={active && !isAlert ? { background: BRAND } : {}}
            >
              {tab.label}
              <span className={`inline-flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[10px] font-bold px-1 ${
                active ? 'bg-white/25 text-white' : isAlert ? 'bg-red-100 text-red-600' : 'bg-slate-100 text-slate-500'
              }`}>
                {counts[tab.id]}
              </span>
            </button>
          )
        })}
      </div>

      {/* Contract cards */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
          <div className="w-14 h-14 rounded-3xl bg-slate-100 flex items-center justify-center">
            <Inbox className="w-7 h-7 text-slate-400" />
          </div>
          <p className="text-gray-500 font-medium">Nenhum contrato encontrado</p>
          <p className="text-gray-400 text-sm">Tudo em dia ou nenhum resultado para o filtro selecionado.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(c => (
            <ContaCard key={c.id} contract={c} onPayment={onPayment} />
          ))}
        </div>
      )}
    </div>
  )
}

function ContaCard({ contract, onPayment }: {
  contract: RecentContract
  onPayment: (c: RecentContract) => void
}) {
  const overdue   = isOverdue(contract.first_due_date, contract.status)
  const remaining = Math.max(0, contract.total_amount - contract.paid_amount)
  const phone     = contract.client_phone?.replace(/\D/g, '')

  const today = new Date(); today.setHours(0, 0, 0, 0)
  const dueD  = contract.first_due_date ? new Date(contract.first_due_date + 'T00:00:00') : null
  const daysOverdue = dueD ? Math.floor((today.getTime() - dueD.getTime()) / 86_400_000) : 0

  const dueDateFormatted = contract.first_due_date
    ? new Date(contract.first_due_date + 'T00:00:00').toLocaleDateString('pt-BR')
    : '—'

  const waMsg = encodeURIComponent(
    overdue
      ? `Olá, ${contract.client_name}! Tudo bem? 😊\n\nPassando para lembrá-lo(a) que identificamos uma pendência no valor de *${formatCurrency(remaining)}*, cujo vencimento foi em *${dueDateFormatted}*.\n\nPedimos que entre em contato para regularizarmos. Estamos à disposição! 🤝`
      : `Olá, ${contract.client_name}! Tudo bem? 😊\n\nPassando para lembrá-lo(a) de que seu contrato no valor de *${formatCurrency(remaining)}* vence em *${dueDateFormatted}*. Qualquer dúvida, estamos à disposição! 🤝`
  )
  const waLink = phone ? `https://api.whatsapp.com/send?phone=55${phone}&text=${waMsg}` : null

  return (
    <div className={`bg-white rounded-3xl p-5 shadow-sm border ${overdue ? 'border-red-100' : 'border-transparent'}`}>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 truncate">{contract.client_name}</span>
            <ScoreBadge score={contract.client_score} />
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
            {contract.contract_number && (
              <span className="flex items-center gap-1">
                <Hash className="w-3 h-3" />{contract.contract_number}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Vence {dueDateFormatted}
            </span>
            {overdue && daysOverdue > 0 && (
              <span className="flex items-center gap-1 text-red-500 font-medium">
                <AlertCircle className="w-3 h-3" />
                {daysOverdue} dia{daysOverdue !== 1 ? 's' : ''} em atraso
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-lg font-bold ${overdue ? 'text-red-500' : 'text-gray-900'}`}>
            {formatCurrency(remaining)}
          </p>
          <p className="text-xs text-gray-400">
            {contract.total_interest > 0 ? `${((contract.total_interest / contract.total_amount) * 100).toFixed(0)}% juros` : 'sem juros'}
          </p>
        </div>
      </div>

      {/* Progress bar if partial payment made */}
      {contract.paid_amount > 0 && (
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Pago: {formatCurrency(contract.paid_amount)}</span>
            <span>Total: {formatCurrency(contract.total_amount)}</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-emerald-400"
              style={{ width: `${Math.min(100, (contract.paid_amount / contract.total_amount) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => onPayment(contract)}
          className="flex-1 flex items-center justify-center gap-2 text-white text-sm font-semibold py-2.5 rounded-2xl transition-all active:scale-95"
          style={{ background: BRAND }}
          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.92)')}
          onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
        >
          <CheckCheck className="w-4 h-4" />
          Receber
        </button>
        {waLink && (
          <a
            href={waLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl text-sm font-semibold bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-all"
          >
            <WhatsAppIcon className="w-4 h-4" />
            Cobrar
          </a>
        )}
      </div>
    </div>
  )
}

// ─── ClientsView ──────────────────────────────────────────────────────────────

function ClientsView({
  clientsData, loading, clientSearch, setClientSearch,
  onViewDetails, onViewHistory, onEditClient, onDeleteClient, onNewContract, onNewClient,
}: {
  clientsData: ClientWithStats[]
  loading: boolean
  clientSearch: string
  setClientSearch: (v: string) => void
  onViewDetails: (id: string) => void
  onViewHistory: (id: string) => void
  onEditClient: (client: ClientWithStats) => void
  onDeleteClient: (id: string) => void
  onNewContract: () => void
  onNewClient: () => void
}) {
  const [scoreFilter, setScoreFilter] = useState<'all' | 'bom_pagador' | 'neutro' | 'mal_pagador'>('all')

  const filtered = clientsData.filter(c => {
    const matchName = !clientSearch || c.name.toLowerCase().includes(clientSearch.toLowerCase())
    const matchScore = scoreFilter === 'all' || c.score === scoreFilter
    return matchName && matchScore
  })

  const counts = {
    bom_pagador: clientsData.filter(c => c.score === 'bom_pagador').length,
    neutro:      clientsData.filter(c => c.score === 'neutro').length,
    mal_pagador: clientsData.filter(c => c.score === 'mal_pagador').length,
  }

  return (
    <>
      <div className="flex items-start justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Clientes</h1>
          <p className="text-gray-400 text-sm mt-0.5">{clientsData.length} cliente{clientsData.length !== 1 ? 's' : ''} cadastrado{clientsData.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={onNewClient}
            className="flex items-center gap-2 text-sm font-semibold px-5 py-3 rounded-2xl shadow-sm transition-all active:scale-95 bg-white border border-gray-200 text-gray-700 hover:border-gray-300"
          >
            <UserPlus className="w-4 h-4" />
            Novo Cliente
          </button>
          <button
            onClick={onNewContract}
            className="flex items-center gap-2 text-white text-sm font-semibold px-5 py-3 rounded-2xl shadow-sm transition-all active:scale-95"
            style={{ background: BRAND }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.92)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
          >
            <Plus className="w-4 h-4" />
            Novo Contrato
          </button>
        </div>
      </div>

      <div className="bg-white rounded-[32px] shadow-sm overflow-hidden">
        <div className="flex flex-col gap-3 px-6 py-5 border-b border-slate-100">
          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={clientSearch}
              onChange={e => setClientSearch(e.target.value)}
              placeholder="Buscar cliente..."
              className={`${inputCls} pl-10 pr-4 py-2.5 text-sm`}
            />
          </div>
          {/* Filtros de score */}
          <div className="flex items-center gap-2 flex-wrap">
            {([
              { key: 'all',         label: 'Todos',        count: clientsData.length, color: '' },
              { key: 'bom_pagador', label: 'Bom pagador',  count: counts.bom_pagador, color: '#16a34a' },
              { key: 'neutro',      label: 'Neutro',        count: counts.neutro,      color: '#64748b' },
              { key: 'mal_pagador', label: 'Mal pagador',   count: counts.mal_pagador, color: '#dc2626' },
            ] as { key: typeof scoreFilter; label: string; count: number; color: string }[]).map(f => (
              <button
                key={f.key}
                onClick={() => setScoreFilter(f.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
                  scoreFilter === f.key
                    ? 'text-white border-transparent'
                    : 'bg-slate-50 border-slate-200 text-gray-500 hover:bg-slate-100'
                }`}
                style={scoreFilter === f.key ? { background: f.color || BRAND, borderColor: f.color || BRAND } : {}}
              >
                {f.key !== 'all' && <span className="w-1.5 h-1.5 rounded-full" style={{ background: scoreFilter === f.key ? 'white' : f.color }} />}
                {f.label}
                <span className={`ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] ${scoreFilter === f.key ? 'bg-white/20' : 'bg-slate-200 text-gray-600'}`}>
                  {f.count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <TableSkeleton />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
            <div className="w-12 h-12 rounded-3xl flex items-center justify-center" style={{ background: '#4ABCB115' }}>
              <Users className="w-6 h-6" style={{ color: BRAND }} />
            </div>
            <p className="text-gray-900 font-semibold">Nenhum cliente encontrado</p>
            <p className="text-gray-400 text-sm">Crie um contrato para cadastrar clientes automaticamente.</p>
          </div>
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[1fr_180px_120px_140px_44px] gap-2 px-6 py-3 border-b border-slate-50">
              {['Cliente', 'WhatsApp', 'Contratos', 'Saldo Devedor', ''].map(h => (
                <span key={h} className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{h}</span>
              ))}
            </div>
            <div className="divide-y divide-slate-50">
              {filtered.map(client => (
                <ClientRow
                  key={client.id}
                  client={client}
                  onViewDetails={onViewDetails}
                  onViewHistory={onViewHistory}
                  onEdit={onEditClient}
                  onDelete={onDeleteClient}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </>
  )
}

function ClientRow({ client, onViewDetails, onViewHistory, onEdit, onDelete }: {
  client: ClientWithStats
  onViewDetails: (id: string) => void
  onViewHistory: (id: string) => void
  onEdit: (client: ClientWithStats) => void
  onDelete: (id: string) => void
}) {
  const [menuOpen, setMenuOpen]       = useState(false)
  const [confirmDel, setConfirmDel]   = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) { setConfirmDel(false); return }
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [menuOpen])

  const phoneDigits   = client.phone?.replace(/\D/g, '') ?? ''
  const phoneFormatted = formatPhoneDisplay(client.phone)
  const waLink = phoneDigits ? `https://api.whatsapp.com/send?phone=55${phoneDigits}` : null

  return (
    <div className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_180px_120px_140px_44px] gap-2 items-center px-6 py-4 hover:bg-slate-50/50 transition-colors">

      {/* Nome + avatar */}
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-9 h-9 rounded-2xl flex items-center justify-center text-white text-sm font-bold shrink-0"
          style={{ background: BRAND + 'CC' }}
        >
          {getInitials(client.name)}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{client.name}</p>
          <div className="flex items-center gap-1.5 flex-wrap">
            {phoneFormatted && (
              <p className="text-xs text-gray-400 md:hidden">{phoneFormatted}</p>
            )}
            <ScoreBadge score={client.score} />
          </div>
        </div>
      </div>

      {/* WhatsApp — padronizado */}
      <div className="hidden md:flex items-center gap-1.5">
        {phoneFormatted ? (
          <a
            href={waLink ?? '#'} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-gray-600 hover:text-emerald-600 transition-colors group"
          >
            <WhatsAppIcon className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span className="group-hover:underline">{phoneFormatted}</span>
          </a>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </div>

      {/* Contratos */}
      <div className="hidden md:block">
        <span className="text-sm font-semibold text-gray-800">{client.contract_count}</span>
        <span className="text-xs text-gray-400 ml-1">{client.contract_count === 1 ? 'contrato' : 'contratos'}</span>
      </div>

      {/* Saldo devedor */}
      <div className="hidden md:block">
        <span className={`text-sm font-semibold tabular-nums ${client.total_balance > 0 ? 'text-gray-900' : 'text-gray-300'}`}>
          {client.total_balance > 0 ? formatCurrency(client.total_balance) : '—'}
        </span>
      </div>

      {/* 3 pontinhos */}
      <div className="relative flex justify-end" ref={menuRef}>
        <button
          onClick={() => setMenuOpen(v => !v)}
          className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-slate-100 transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-9 z-50 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 w-52 animate-fade-in">
            <button
              onClick={() => { setMenuOpen(false); onViewDetails(client.id) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 transition-colors"
            >
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              Ver Detalhes
            </button>
            <button
              onClick={() => { setMenuOpen(false); onViewHistory(client.id) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 transition-colors"
            >
              <History className="w-4 h-4 text-gray-400 shrink-0" />
              Ver Histórico
            </button>
            <button
              onClick={() => { setMenuOpen(false); onEdit(client) }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-slate-50 transition-colors"
            >
              <Pencil className="w-4 h-4 text-gray-400 shrink-0" />
              Editar Cliente
            </button>
            <div className="my-1 border-t border-slate-100" />
            {confirmDel ? (
              <button
                onClick={() => { setMenuOpen(false); onDelete(client.id) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 transition-colors"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                Confirmar exclusão
              </button>
            ) : (
              <button
                onClick={() => setConfirmDel(true)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4 shrink-0" />
                Excluir Cliente
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── ReportsView ──────────────────────────────────────────────────────────────

function ReportsView({ contracts, monthlyProfits, totalProfit, settledContracts, nextInstallments, loading, onReload, monthlyGoal, savingGoal, onSaveGoal }: {
  contracts: RecentContract[]
  monthlyProfits: MonthlyProfit[]
  totalProfit: number
  settledContracts: { id: string; total_amount: number; total_interest: number; created_at: string }[]
  nextInstallments: NextInstallment[]
  loading: boolean
  onReload: () => void
  monthlyGoal: number
  savingGoal: boolean
  onSaveGoal: (value: number) => Promise<void>
}) {
  const [editingGoal, setEditingGoal] = useState(false)
  const [goalInput, setGoalInput]     = useState('')
  const [reportFrom, setReportFrom]   = useState('')
  const [reportTo,   setReportTo]     = useState('')
  const [reportPreset, setReportPreset] = useState<'week'|'month'|'last3'|'year'|'custom'|''>('')

  function applyPreset(preset: typeof reportPreset) {
    const now = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`
    const today = fmt(now)
    let from = ''
    if (preset === 'week') {
      const d = new Date(now); d.setDate(now.getDate() - now.getDay())
      from = fmt(d)
    } else if (preset === 'month') {
      from = `${now.getFullYear()}-${pad(now.getMonth()+1)}-01`
    } else if (preset === 'last3') {
      const d = new Date(now); d.setMonth(now.getMonth() - 3)
      from = fmt(d)
    } else if (preset === 'year') {
      from = `${now.getFullYear()}-01-01`
    }
    setReportPreset(preset)
    setReportFrom(from)
    setReportTo(today)
  }

  function clearFilter() {
    setReportPreset(''); setReportFrom(''); setReportTo('')
  }

  // ── Métricas ──────────────────────────────────────────────────────────────
  // Usa isOverdue por data — contratos 'active' com due_date passada são tratados como vencidos
  const inPlayList  = contracts.filter(c => c.status === 'active' || c.status === 'overdue')
  const overdueList = inPlayList.filter(c => isOverdue(c.first_due_date, c.status))
  const activeList  = inPlayList.filter(c => !isOverdue(c.first_due_date, c.status))

  // Inadimplência sempre usa o total (não filtra por período — pedido do usuário)
  const inadimplencia = inPlayList.length > 0 ? (overdueList.length / inPlayList.length) * 100 : 0

  const hasFilter = !!(reportFrom || reportTo)

  // Contratos pagos filtrados pelo período — usa created_at (mesma fonte do totalProfit)
  const settledFiltered = hasFilter
    ? settledContracts.filter(c => {
        const d = c.created_at.split('T')[0]
        if (reportFrom && d < reportFrom) return false
        if (reportTo   && d > reportTo)   return false
        return true
      })
    : settledContracts

  const filteredProfit = settledFiltered.reduce((s, c) => s + (c.total_interest ?? 0), 0)
  const filteredInPlayList = hasFilter
    ? inPlayList.filter(c => {
        const d = c.contract_date
        if (reportFrom && d < reportFrom) return false
        if (reportTo   && d > reportTo)   return false
        return true
      })
    : inPlayList

  const capitalNaRua  = filteredInPlayList.reduce((s, c) => s + Math.max(0, (c.total_amount ?? 0) - (c.total_interest ?? 0)), 0)
  const lucroPrevisto = filteredInPlayList.reduce((s, c) => s + (c.total_interest ?? 0), 0)
  const lucroRealizado = hasFilter ? filteredProfit : totalProfit

  // ── Próximos Recebimentos (derivado dos contratos, sem tabela installments) ─
  const todayStr7  = new Date().toISOString().split('T')[0]
  const limit7Date = new Date(); limit7Date.setDate(limit7Date.getDate() + 7)
  const limit7Str  = limit7Date.toISOString().split('T')[0]
  const upcomingInstallments: NextInstallment[] = activeList
    .filter(c => !!c.first_due_date && c.first_due_date >= todayStr7 && c.first_due_date <= limit7Str)
    .sort((a, b) => (a.first_due_date ?? '').localeCompare(b.first_due_date ?? ''))
    .map(c => ({ id: c.id, client_name: c.client_name ?? '—', due_date: c.first_due_date!, amount: c.total_amount ?? 0 }))

  const inadColor = inadimplencia > 20 ? '#EF4444' : inadimplencia > 5 ? '#F59E0B' : '#22C55E'
  const inadBg    = inadimplencia > 20 ? '#EF444415' : inadimplencia > 5 ? '#F59E0B15' : '#22C55E15'

  // ── Meta mensal ───────────────────────────────────────────────────────────
  const currentMonthProfit = monthlyProfits[monthlyProfits.length - 1]?.value ?? 0
  // While editing, parse the typed value for real-time ring update
  const effectiveGoal = editingGoal
    ? (parseCurrencyInput(goalInput) || monthlyGoal)
    : monthlyGoal
  const goalPct   = Math.min((currentMonthProfit / effectiveGoal) * 100, 100)
  const goalDone  = goalPct >= 100

  async function handleSaveGoal() {
    const value = parseCurrencyInput(goalInput)
    if (!value || value <= 0) { setEditingGoal(false); return }
    await onSaveGoal(value)
    setEditingGoal(false)
  }

  // SVG ring
  const R    = 44
  const circ = 2 * Math.PI * R
  const dash = (goalPct / 100) * circ

  // ── Risco ─────────────────────────────────────────────────────────────────
  const overdueWithDays = overdueList.map(c =>
    c.first_due_date
      ? Math.max(0, Math.floor((Date.now() - new Date(c.first_due_date + 'T00:00:00').getTime()) / 86_400_000))
      : 0
  )
  const greenCount  = activeList.length
  const yellowCount = overdueList.filter((_, i) => overdueWithDays[i] >= 1 && overdueWithDays[i] < 3).length
  const redCount    = overdueList.filter((_, i) => overdueWithDays[i] >= 3 && overdueWithDays[i] < 8).length
  const blackCount  = overdueList.filter((_, i) => overdueWithDays[i] >= 8).length

  const riskPieData = [
    { name: 'No prazo',   value: greenCount,  color: '#22C55E' },
    { name: 'Atenção',    value: yellowCount, color: '#EAB308' },
    { name: 'Risco alto', value: redCount,    color: '#EF4444' },
    { name: 'Crítico',    value: blackCount,  color: '#111827' },
  ].filter(d => d.value > 0)

  const barData = monthlyProfits.map(m => ({ name: m.month, valor: m.value }))

  function BarTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-gray-900 text-white text-xs font-medium px-3 py-2 rounded-xl shadow-lg">
        <p className="text-gray-400 mb-0.5 capitalize">{label}</p>
        <p>{formatCurrency(payload[0].value)}</p>
      </div>
    )
  }

  function PieLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) {
    if (percent < 0.05) return null
    const RAD = Math.PI / 180
    const r = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + r * Math.cos(-midAngle * RAD)
    const y = cy + r * Math.sin(-midAngle * RAD)
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    )
  }

  return (
    <>
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-4 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Relatórios</h1>
          <p className="text-gray-400 text-sm mt-0.5">Painel executivo do seu portfólio</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => exportToCSV(contracts.map(c => ({
              'Nº Contrato':   c.contract_number ?? '',
              'Cliente':       c.client_name,
              'Valor Total':   c.total_amount,
              'Juros':         c.total_interest,
              'Pago':          c.paid_amount,
              'Status':        getStatusLabel(c.status, c.first_due_date),
              'Data':          c.contract_date,
              'Vencimento':    c.first_due_date ?? '',
              'Tipo':          c.payment_type,
              'Parcelas':      c.installments,
            })), `contratos_${new Date().toISOString().split('T')[0]}.csv`)}
            className="flex items-center gap-1.5 text-gray-500 text-sm font-medium px-3 py-2.5 rounded-2xl border border-gray-200 bg-white hover:bg-slate-50 transition-colors"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">CSV Contratos</span>
          </button>
          <button
            onClick={onReload}
            disabled={loading}
            className="flex items-center gap-2 text-gray-500 text-sm font-medium px-4 py-2.5 rounded-2xl border border-gray-200 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Atualizar</span>
          </button>
        </div>
      </div>

      {/* ── Filtro de período ───────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl shadow-sm px-5 py-4 mb-6 flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Período:</span>
        {([
          { key: 'week',  label: 'Esta semana' },
          { key: 'month', label: 'Este mês' },
          { key: 'last3', label: 'Últimos 3 meses' },
          { key: 'year',  label: 'Este ano' },
        ] as { key: typeof reportPreset; label: string }[]).map(p => (
          <button
            key={p.key}
            onClick={() => reportPreset === p.key ? clearFilter() : applyPreset(p.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border ${
              reportPreset === p.key
                ? 'text-white border-transparent'
                : 'bg-slate-50 border-slate-200 text-gray-500 hover:bg-slate-100'
            }`}
            style={reportPreset === p.key ? { background: BRAND, borderColor: BRAND } : {}}
          >
            {p.label}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <input
            type="date" value={reportFrom}
            onChange={e => { setReportFrom(e.target.value); setReportPreset('custom') }}
            className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-teal-400"
          />
          <span className="text-xs text-gray-400">até</span>
          <input
            type="date" value={reportTo}
            onChange={e => { setReportTo(e.target.value); setReportPreset('custom') }}
            className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-gray-600 focus:outline-none focus:border-teal-400"
          />
          {(reportFrom || reportTo) && (
            <button onClick={clearFilter} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-xl hover:bg-slate-100">
              Limpar
            </button>
          )}
        </div>
        {hasFilter && (
          <div className="w-full flex items-center gap-2 pt-2 border-t border-slate-100 mt-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-teal-500 shrink-0" />
            <span className="text-xs text-gray-400">Métricas filtradas pelo período selecionado. Inadimplência permanece com visão geral.</span>
          </div>
        )}
      </div>

      {/* ── Meta + 3 KPIs ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">

        {/* Meta de Lucro Mensal — ocupa 2 cols */}
        <div
          className="lg:col-span-2 rounded-3xl p-6 shadow-sm flex items-center gap-6 relative overflow-hidden"
          style={{ background: goalDone ? 'linear-gradient(135deg,#16a34a,#22c55e)' : 'linear-gradient(135deg,#0f9b8e,#4ABCB1)' }}
        >
          <div className="absolute -bottom-8 -right-8 w-36 h-36 rounded-full bg-white/10 pointer-events-none" />

          {/* Anel SVG */}
          <div className="relative shrink-0">
            <svg width="100" height="100" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r={R} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="9" />
              <circle
                cx="50" cy="50" r={R} fill="none"
                stroke="white" strokeWidth="9"
                strokeDasharray={`${dash} ${circ}`}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
                style={{ transition: 'stroke-dasharray 1s ease' }}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {goalDone
                ? <span className="text-2xl">🏆</span>
                : <span className="text-lg font-black text-white leading-none">{goalPct.toFixed(0)}%</span>
              }
            </div>
          </div>

          {/* Texto */}
          <div className="min-w-0 flex-1">
            <p className="text-white/80 text-[10px] font-bold uppercase tracking-wider mb-1">
              Meta de Lucro Mensal
            </p>
            <p className="text-white text-2xl font-black tabular-nums leading-none mb-1">
              {loading ? '—' : formatCurrency(currentMonthProfit)}
            </p>

            {/* Editable goal row */}
            {editingGoal ? (
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-white/70 text-xs shrink-0">Meta: R$</span>
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  value={goalInput}
                  onChange={e => setGoalInput(formatCurrencyInput(e.target.value))}
                  onKeyDown={e => { if (e.key === 'Enter') handleSaveGoal(); if (e.key === 'Escape') setEditingGoal(false) }}
                  className="w-24 bg-white/20 text-white text-xs font-semibold rounded-lg px-2 py-1 outline-none placeholder:text-white/50 border border-white/30 focus:border-white/60"
                  placeholder="0,00"
                />
                <button
                  onClick={handleSaveGoal}
                  disabled={savingGoal}
                  className="text-[10px] font-bold bg-white/25 hover:bg-white/35 text-white px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingGoal ? '...' : 'OK'}
                </button>
                <button
                  onClick={() => setEditingGoal(false)}
                  className="text-[10px] text-white/60 hover:text-white/90 transition-colors"
                >✕</button>
              </div>
            ) : (
              <button
                onClick={() => { setGoalInput(formatCurrencyInput(String(Math.round(monthlyGoal * 100)))); setEditingGoal(true) }}
                className="flex items-center gap-1 text-white/70 hover:text-white text-xs mt-0.5 transition-colors group"
              >
                de {formatCurrency(monthlyGoal)} {goalDone ? '— Meta atingida! 🎉' : ''}
                <span className="text-[10px] bg-white/15 group-hover:bg-white/25 px-1.5 py-0.5 rounded-md transition-colors ml-1">editar</span>
              </button>
            )}

            {/* Barra horizontal */}
            <div className="mt-3 h-1.5 rounded-full bg-white/20 overflow-hidden">
              <div
                className="h-full rounded-full bg-white transition-all duration-700"
                style={{ width: `${goalPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* Capital na Rua */}
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ background: BRAND + '18' }}>
            <Wallet className="w-5 h-5" style={{ color: BRAND }} />
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            {hasFilter ? 'Capital no Período' : 'Capital na Rua'}
          </p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {loading ? '—' : formatCurrency(capitalNaRua)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {hasFilter ? `${filteredInPlayList.length} contratos no período` : 'Principal de contratos ativos'}
          </p>
        </div>

        {/* Lucro Previsto */}
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ background: '#8B5CF615' }}>
            <TrendingUp className="w-5 h-5 text-violet-500" />
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            {hasFilter ? 'Lucro Previsto no Período' : 'Lucro Total Previsto'}
          </p>
          <p className="text-2xl font-bold text-gray-900 tabular-nums">
            {loading ? '—' : formatCurrency(lucroPrevisto)}
          </p>
          <p className="text-xs text-gray-400 mt-1">Juros de contratos abertos</p>
        </div>
      </div>

      {/* ── Inadimplência Real (card separado, largura parcial) ─────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ background: inadBg }}>
            <AlertCircle className="w-5 h-5" style={{ color: inadColor }} />
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Inadimplência Real</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: inadColor }}>
            {loading ? '—' : `${inadimplencia.toFixed(1)}%`}
          </p>
          <p className="text-xs text-gray-400 mt-1">{overdueList.length} de {inPlayList.length} contratos em atraso</p>
        </div>

        {/* Lucro Realizado */}
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-3" style={{ background: '#22C55E15' }}>
            <DollarSign className="w-5 h-5 text-emerald-500" />
          </div>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
            {hasFilter ? 'Lucro Realizado no Período' : 'Lucro Realizado Total'}
          </p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: '#22C55E' }}>
            {loading ? '—' : formatCurrency(lucroRealizado)}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {hasFilter ? `${settledFiltered.length} contratos pagos` : 'Juros de contratos pagos'}
          </p>
        </div>

        {/* Placeholder — mantém grid alinhado */}
        <div className="hidden lg:block lg:col-span-2" />
      </div>

      {/* ── Gráfico de Evolução + Distribuição de Risco ─────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">

        {/* Entradas Mensais */}
        <div className="bg-white rounded-[32px] shadow-sm p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Evolução de Entradas</h2>
              <p className="text-xs text-gray-400 mt-0.5">Lucro recebido mês a mês</p>
            </div>
          </div>
          {loading ? (
            <div className="flex items-end gap-4 h-48 animate-pulse">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full bg-slate-100 rounded-xl" style={{ height: `${25 + i * 12}%` }} />
                  <div className="h-2.5 w-8 bg-slate-100 rounded-full" />
                </div>
              ))}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={barData} barCategoryGap="30%" margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: '#9CA3AF', fontWeight: 500 }}
                  style={{ textTransform: 'capitalize' }}
                />
                <YAxis hide />
                <Tooltip content={<BarTooltip />} cursor={{ fill: '#F1F5F9', radius: 8 } as any} />
                <Bar dataKey="valor" radius={[8, 8, 4, 4]} maxBarSize={48}>
                  {barData.map((entry, i) => (
                    <Cell key={i} fill={entry.valor > 0 ? BRAND : '#E2E8F0'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Distribuição de Risco */}
        <div className="bg-white rounded-[32px] shadow-sm p-6 flex flex-col">
          <div className="mb-1">
            <h2 className="text-base font-semibold text-gray-900">Distribuição de Risco</h2>
            <p className="text-xs text-gray-400 mt-0.5">Por dias de atraso</p>
          </div>
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-36 h-36 rounded-full bg-slate-100 animate-pulse" />
            </div>
          ) : riskPieData.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
              <CheckCircle2 className="w-8 h-8 text-gray-200" />
              <p className="text-xs text-gray-400">Sem contratos ativos</p>
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie
                    data={riskPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%" cy="50%"
                    innerRadius={38} outerRadius={70}
                    paddingAngle={2}
                    labelLine={false}
                    label={<PieLabel />}
                  >
                    {riskPieData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-col gap-2.5 mt-2">
                {[
                  { label: 'No prazo',   count: greenCount,  color: '#22C55E', sub: 'A receber' },
                  { label: 'Atenção',    count: yellowCount, color: '#EAB308', sub: '1 a 2 dias atraso' },
                  { label: 'Risco alto', count: redCount,    color: '#EF4444', sub: '3 a 7 dias atraso' },
                  { label: 'Crítico',    count: blackCount,  color: '#111827', sub: '8+ dias atraso' },
                ].map(item => (
                  <div key={item.label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: item.color }} />
                      <div>
                        <p className="text-xs font-semibold text-gray-700 leading-none">{item.label}</p>
                        <p className="text-[10px] text-gray-400">{item.sub}</p>
                      </div>
                    </div>
                    <span className="text-sm font-bold text-gray-900">{item.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Próximos Recebimentos ──────────────────────────────────────────── */}
      <div className="bg-white rounded-[32px] shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Próximos Recebimentos</h2>
            <p className="text-xs text-gray-400 mt-0.5">Parcelas com vencimento nos próximos 7 dias</p>
          </div>
          {!loading && upcomingInstallments.length > 0 && (
            <span className="text-xs font-semibold px-3 py-1 rounded-full" style={{ background: BRAND + '20', color: BRAND }}>
              {upcomingInstallments.length} parcela{upcomingInstallments.length > 1 ? 's' : ''}
            </span>
          )}
        </div>
        {loading ? (
          <div className="divide-y divide-slate-50">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-6 py-4 flex items-center gap-4 animate-pulse">
                <div className="w-9 h-9 rounded-2xl bg-slate-100 shrink-0" />
                <div className="flex-1 h-3 bg-slate-100 rounded-full" />
                <div className="h-3 w-20 bg-slate-100 rounded-full" />
                <div className="h-6 w-16 bg-slate-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : upcomingInstallments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 gap-2">
            <Calendar className="w-8 h-8 text-gray-200" />
            <p className="text-gray-400 text-sm">Nenhuma parcela nos próximos 7 dias.</p>
          </div>
        ) : (
          <>
            <div className="hidden md:grid grid-cols-[1fr_160px_180px] px-6 py-3 border-b border-slate-50">
              {['Cliente', 'Valor da Parcela', 'Vencimento'].map(h => (
                <span key={h} className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{h}</span>
              ))}
            </div>
            <div className="divide-y divide-slate-50">
              {upcomingInstallments.map(inst => {
                const due       = new Date(inst.due_date + 'T00:00:00')
                const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0)
                const daysUntil = Math.round((due.getTime() - todayDate.getTime()) / 86_400_000)
                const isToday   = daysUntil === 0
                const isUrgent  = daysUntil > 0 && daysUntil <= 2
                return (
                  <div
                    key={inst.id}
                    className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_160px_180px] gap-2 items-center px-6 py-4 hover:bg-slate-50/60 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="w-9 h-9 rounded-2xl flex items-center justify-center text-white text-sm font-bold shrink-0"
                        style={{ background: BRAND + 'CC' }}
                      >
                        {getInitials(inst.client_name ?? '?')}
                      </div>
                      <p className="text-sm font-semibold text-gray-900 truncate">{inst.client_name}</p>
                    </div>
                    <p className="text-sm font-bold text-gray-900 tabular-nums">{formatCurrency(inst.amount)}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500">
                        {due.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </span>
                      {isToday && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 whitespace-nowrap">Hoje</span>
                      )}
                      {isUrgent && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500 whitespace-nowrap">Em {daysUntil}d</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </>
  )
}

// ─── PaymentModal ─────────────────────────────────────────────────────────────

function PaymentModal({ contract, onClose, onSuccess, onSettled }: {
  contract: RecentContract
  onClose: () => void
  onSuccess: (msg: string) => void
  onSettled?: (clientId: string) => void
}) {
  type PayMode = 'integral' | 'partial' | 'interest_only'
  const [mode, setMode]               = useState<PayMode>('integral')
  const [partialRaw, setPartialRaw]   = useState('')
  const [payDate, setPayDate]         = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [paidAmount, setPaidAmount]   = useState<number | null>(null)

  const remaining     = Math.max(0, contract.total_amount - contract.paid_amount)
  const interestPart  = contract.total_interest
  const partialAmount = parseCurrencyInput(partialRaw)

  const dueDate = contract.first_due_date
  const overdueDays = dueDate
    ? Math.max(0, Math.floor((new Date(payDate).getTime() - new Date(dueDate + 'T00:00:00').getTime()) / 86_400_000))
    : 0
  const isLate = overdueDays > 0

  // Valor que será efetivamente recebido nesta operação
  const amountToReceive = mode === 'integral'
    ? remaining
    : mode === 'interest_only'
      ? interestPart
      : partialAmount

  const phone = contract.client_phone?.replace(/\D/g, '')
  const waMsg = encodeURIComponent(
    `Olá, ${contract.client_name}! Confirmamos o recebimento de *${formatCurrency(amountToReceive)}* referente ao seu contrato. Obrigado! 🤝`
  )
  const waLink = phone ? `https://api.whatsapp.com/send?phone=55${phone}&text=${waMsg}` : null

  async function handleConfirm() {
    if (mode === 'partial' && (!partialAmount || partialAmount <= 0)) {
      setError('Informe o valor recebido.'); return
    }
    if (mode === 'partial' && partialAmount > remaining) {
      setError('Valor maior que o saldo pendente.'); return
    }
    setError(null)
    setSaving(true)
    try {
      const newPaidAmount = contract.paid_amount + amountToReceive

      if (mode === 'integral' || newPaidAmount >= contract.total_amount) {
        // Quitação total
        await (supabase.from('contracts') as any)
          .update({ status: 'settled', paid_amount: contract.total_amount, paid_at: payDate })
          .eq('id', contract.id)
        setPaidAmount(amountToReceive)
        onSuccess('Contrato quitado com sucesso!')
        onSettled?.(contract.client_id)
      } else if (mode === 'interest_only') {
        // Só juros — acumula pagamento, mantém ativo
        await (supabase.from('contracts') as any)
          .update({ paid_amount: newPaidAmount })
          .eq('id', contract.id)
        setPaidAmount(amountToReceive)
        onSuccess('Juros registrados com sucesso!')
      } else {
        // Parcial — acumula pagamento
        await (supabase.from('contracts') as any)
          .update({ paid_amount: newPaidAmount })
          .eq('id', contract.id)
        setPaidAmount(amountToReceive)
        onSuccess(`Pagamento parcial de ${formatCurrency(amountToReceive)} registrado!`)
      }
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao registrar pagamento.')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white w-full sm:max-w-md rounded-t-[32px] sm:rounded-[32px] shadow-2xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Registrar Pagamento</h2>
            <p className="text-gray-400 text-xs mt-0.5">Contrato #{contract.contract_number ?? contract.id.slice(0, 6)}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-slate-50 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-4">

          {/* Cliente */}
          <div className="flex items-center gap-3 bg-slate-50 rounded-2xl px-4 py-3">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center text-white text-sm font-bold shrink-0" style={{ background: BRAND }}>
              {getInitials(contract.client_name)}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{contract.client_name}</p>
              <ScoreBadge score={contract.client_score} />
            </div>
          </div>

          {/* Dados financeiros */}
          <div className="bg-slate-50 rounded-2xl px-4 py-3 flex flex-col gap-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Vencimento</span>
              <span className={`font-semibold ${isLate ? 'text-red-500' : 'text-gray-800'}`}>
                {dueDate ? new Date(dueDate + 'T00:00:00').toLocaleDateString('pt-BR') : '—'}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Valor total</span>
              <span className="font-semibold text-gray-800">{formatCurrency(contract.total_amount)}</span>
            </div>
            {contract.paid_amount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Já pago</span>
                <span className="font-semibold text-emerald-600">{formatCurrency(contract.paid_amount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-slate-200 pt-1.5 mt-0.5">
              <span className="text-gray-700 font-semibold">Saldo pendente</span>
              <span className="font-bold text-gray-900">{formatCurrency(remaining)}</span>
            </div>
          </div>

          {/* Aviso de atraso */}
          {isLate && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-amber-700 text-xs font-medium">
                Pagamento informado com <strong>{overdueDays} dia{overdueDays > 1 ? 's' : ''} de atraso</strong>. Isso pode afetar a classificação do cliente.
              </p>
            </div>
          )}

          {/* Forma de recebimento */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">Forma de recebimento</label>
            {([
              { value: 'integral',      label: 'Receber valor pendente', sub: 'Registra quitação total do contrato.' },
              { value: 'interest_only', label: 'Receber apenas juros',   sub: 'Reagenda o saldo principal.' },
              { value: 'partial',       label: 'Receber valor parcial',  sub: 'Informe o valor e reprograme o saldo.' },
            ] as { value: PayMode; label: string; sub: string }[]).map(opt => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setMode(opt.value)}
                className={`flex items-start gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all`}
                style={mode === opt.value
                  ? { borderColor: BRAND, background: BRAND + '0d' }
                  : { borderColor: '#e2e8f0' }
                }
              >
                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center transition-colors`}
                  style={mode === opt.value ? { borderColor: BRAND } : { borderColor: '#cbd5e1' }}
                >
                  {mode === opt.value && <div className="w-2 h-2 rounded-full" style={{ background: BRAND }} />}
                </div>
                <div>
                  <p className={`text-sm font-semibold ${mode === opt.value ? 'text-gray-900' : 'text-gray-600'}`}>{opt.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{opt.sub}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Valor parcial */}
          {mode === 'partial' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-gray-700">Valor recebido</label>
              <div className="relative">
                <DollarSign className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  autoFocus
                  type="text"
                  inputMode="numeric"
                  value={partialRaw}
                  onChange={e => setPartialRaw(formatCurrencyInput(e.target.value))}
                  placeholder="0,00"
                  className={`${inputCls} pl-10 pr-4 py-3`}
                />
              </div>
              <p className="text-xs text-gray-400">Restará {formatCurrency(Math.max(0, remaining - partialAmount))} após esse pagamento.</p>
            </div>
          )}

          {/* Data do pagamento */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">Data do pagamento</label>
            <div className="relative">
              <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="date"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
                className={`${inputCls} pl-10 pr-4 py-3`}
              />
            </div>
          </div>

          {/* Resumo financeiro */}
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl px-4 py-3">
            <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-2">Resumo financeiro</p>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Receber agora</span>
              <span className="font-bold text-emerald-700">{formatCurrency(amountToReceive > 0 ? amountToReceive : 0)}</span>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          )}

          {/* Botões */}
          <div className="flex flex-col gap-2 mt-1">
            {paidAmount !== null && (
              <button
                type="button"
                onClick={() => generateReciboPDF(contract, paidAmount, mode, payDate)}
                className="w-full flex items-center justify-center gap-2 text-emerald-700 text-sm font-semibold px-5 py-3.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 transition-colors border border-emerald-100"
              >
                <Receipt className="w-4 h-4" />
                Baixar Recibo PDF
              </button>
            )}
            {paidAmount === null && (
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className="w-full flex items-center justify-center gap-2 text-white text-sm font-semibold px-5 py-3.5 rounded-2xl transition-all disabled:opacity-60"
              style={{ background: BRAND }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCheck className="w-4 h-4" />}
              Confirmar pagamento
            </button>
            )}
            {waLink && (
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-center gap-2 text-emerald-700 text-sm font-semibold px-5 py-3.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 transition-colors"
              >
                <WhatsAppIcon className="w-4 h-4" />
                Confirmar no WhatsApp
              </a>
            )}
            <button type="button" onClick={onClose} className="w-full text-sm text-gray-400 hover:text-gray-600 py-2 transition-colors">
              Agora não
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── NewClientModal ───────────────────────────────────────────────────────────

function NewClientModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  return <ClientFormModal onClose={onClose} onSuccess={onSuccess} />
}

function ClientFormModal({ initialClient, onClose, onSuccess }: {
  initialClient?: ClientWithStats
  onClose: () => void
  onSuccess: () => void
}) {
  const isEdit = !!initialClient

  const [name, setName]         = useState(initialClient?.name ?? '')
  const [phone, setPhone]       = useState(formatPhoneDisplay(initialClient?.phone))
  const [cpf, setCpf]           = useState('')
  const [address, setAddress]   = useState('')
  const [city, setCity]         = useState('')
  const [state, setState]       = useState('')
  const [score, setScore]       = useState(initialClient?.score ?? 'neutro')
  const [notes, setNotes]       = useState('')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [existingDocs, setExistingDocs]   = useState<{ id: string; label: string; storage_path: string; mime_type: string; size_bytes: number }[]>([])
  const [error, setError]       = useState<string | null>(null)
  const [saving, setSaving]     = useState(false)

  // Fetch extra fields when editing
  useEffect(() => {
    if (!initialClient) return
    ;(supabase.from('clients') as any)
      .select('cpf, address, city, state, score, notes')
      .eq('id', initialClient.id)
      .single()
      .then(({ data }: any) => {
        if (data) {
          setCpf(data.cpf ?? '')
          setAddress(data.address ?? '')
          setCity(data.city ?? '')
          setState(data.state ?? '')
          setScore(data.score ?? 'neutro')
          setNotes(data.notes ?? '')
        }
      })
    // Buscar documentos já enviados
    ;(supabase.from('client_documents') as any)
      .select('id, label, storage_path, mime_type, size_bytes')
      .eq('client_id', initialClient.id)
      .order('uploaded_at', { ascending: false })
      .then(({ data }: any) => setExistingDocs(data ?? []))
  }, [initialClient])

  async function uploadFiles(clientId: string, userId: string) {
    for (const file of selectedFiles) {
      const path = `${userId}/${clientId}/${Date.now()}_${file.name}`
      const { error: upErr } = await supabase.storage.from('client-docs').upload(path, file)
      if (upErr) { console.error('[uploadFiles]', upErr); continue }
      await (supabase.from('client_documents') as any).insert({
        client_id:    clientId,
        owner_id:     userId,
        label:        file.name,
        storage_path: path,
        mime_type:    file.type || 'application/octet-stream',
        size_bytes:   file.size,
      })
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Informe o nome do cliente.'); return }
    if (!phone.replace(/\D/g, '')) { setError('WhatsApp é obrigatório.'); return }
    setSaving(true)
    setError(null)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const payload = {
        name:    name.trim(),
        phone:   maskPhone(phone),
        cpf:     cpf.trim() || null,
        address: address.trim() || null,
        city:    city.trim() || null,
        state:   state.trim() || null,
        score,
        notes:   notes.trim() || null,
      }

      if (isEdit) {
        const { error: err } = await (supabase.from('clients') as any)
          .update(payload)
          .eq('id', initialClient!.id)
        if (err) throw err
        if (selectedFiles.length > 0) await uploadFiles(initialClient!.id, user!.id)
      } else {
        const { data: newClient, error: err } = await (supabase.from('clients') as any)
          .insert({ user_id: user!.id, ...payload })
          .select('id')
          .single()
        if (err) throw err
        if (selectedFiles.length > 0 && newClient) await uploadFiles(newClient.id, user!.id)
      }
      onSuccess()
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao salvar cliente.')
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-[32px] shadow-2xl w-full max-w-lg flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-8 pt-8 pb-6 shrink-0">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{isEdit ? 'Editar Cliente' : 'Novo Cliente'}</h2>
            <p className="text-gray-400 text-sm mt-0.5">
              {isEdit ? `Editando dados de ${initialClient!.name}` : 'Preencha os dados para cadastrar'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-slate-50 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-8 pb-8 flex flex-col gap-4">

          {/* Nome */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">Nome completo</label>
            <div className="relative">
              <UserPlus className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                autoFocus={!isEdit}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Nome do cliente"
                className={`${inputCls} pl-10 pr-4 py-3`}
              />
            </div>
          </div>

          {/* WhatsApp com máscara */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">WhatsApp</label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="tel"
                value={phone}
                onChange={e => setPhone(maskPhone(e.target.value))}
                placeholder="(11) 99999-9999"
                className={`${inputCls} pl-10 pr-4 py-3`}
              />
            </div>
          </div>

          {/* CPF / CNPJ */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">
              CPF / CNPJ <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <div className="relative">
              <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={cpf}
                onChange={e => setCpf(maskCpfCnpj(e.target.value))}
                placeholder="000.000.000-00 ou 00.000.000/0001-00"
                className={`${inputCls} pl-10 pr-4 py-3`}
              />
            </div>
          </div>

          {/* Endereço */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">
              Endereço <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <div className="relative">
              <MapPin className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={address}
                onChange={e => setAddress(e.target.value)}
                placeholder="Rua, número, bairro"
                className={`${inputCls} pl-10 pr-4 py-3`}
              />
            </div>
          </div>

          {/* Cidade + Estado */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-gray-700">Cidade <span className="text-gray-400 font-normal">(opcional)</span></label>
              <input
                type="text"
                value={city}
                onChange={e => setCity(e.target.value)}
                placeholder="Cidade"
                className={`${inputCls} px-4 py-3`}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-semibold text-gray-700">Estado <span className="text-gray-400 font-normal">(opcional)</span></label>
              <input
                type="text"
                value={state}
                onChange={e => setState(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="SP"
                maxLength={2}
                className={`${inputCls} px-4 py-3`}
              />
            </div>
          </div>

          {/* Score manual */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">Classificação do pagador</label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { value: 'bom_pagador', label: 'Bom pagador', color: '#16a34a' },
                { value: 'neutro',      label: 'Neutro',       color: '#64748b' },
                { value: 'mal_pagador', label: 'Mal pagador',  color: '#dc2626' },
              ] as { value: string; label: string; color: string }[]).map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setScore(opt.value)}
                  className={`flex flex-col items-center gap-1 py-3 rounded-2xl border-2 transition-all text-xs font-semibold`}
                  style={score === opt.value
                    ? { borderColor: opt.color, background: opt.color + '15', color: opt.color }
                    : { borderColor: '#e2e8f0', color: '#94a3b8' }
                  }
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: score === opt.value ? opt.color : '#cbd5e1' }} />
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Observações */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700">
              Observações gerais <span className="text-gray-400 font-normal">(opcional)</span>
            </label>
            <div className="relative">
              <FileTextIcon className="absolute left-3.5 top-3.5 w-4 h-4 text-gray-400 pointer-events-none" />
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Informações relevantes sobre este cliente..."
                rows={3}
                className={`${inputCls} pl-10 pr-4 py-3 resize-none`}
              />
            </div>
          </div>

          {/* Documentos */}
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold text-gray-700">
              Documentos <span className="text-gray-400 font-normal">(opcional)</span>
            </label>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf"
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files ?? [])
                setSelectedFiles(prev => [...prev, ...files])
                e.target.value = ''
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 border border-dashed border-gray-300 rounded-2xl px-4 py-3 text-sm text-gray-500 hover:border-[#4ABCB1] hover:text-[#4ABCB1] transition-colors"
            >
              <Upload className="w-4 h-4 shrink-0" />
              Adicionar RG, comprovante, contrato...
            </button>

            {selectedFiles.length > 0 && (
              <div className="flex flex-col gap-1.5">
                {selectedFiles.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-50 rounded-xl px-3 py-2">
                    <FileIcon className="w-4 h-4 text-gray-400 shrink-0" />
                    <span className="text-xs text-gray-700 flex-1 truncate">{f.name}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedFiles(prev => prev.filter((_, j) => j !== i))}
                      className="text-gray-400 hover:text-red-400 transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Documentos já salvos (modo edição) */}
            {existingDocs.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Documentos salvos</p>
                {existingDocs.map(doc => (
                  <div key={doc.id} className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2">
                    <FileIcon className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-xs text-gray-700 flex-1 truncate">{doc.label}</span>
                    <span className="text-[10px] text-gray-400 shrink-0">
                      {(doc.size_bytes / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={async () => {
                        const { data } = await supabase.storage.from('client-docs').createSignedUrl(doc.storage_path, 60)
                        if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                      }}
                      className="text-blue-400 hover:text-blue-600 transition-colors shrink-0"
                      title="Abrir documento"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        await supabase.storage.from('client-docs').remove([doc.storage_path])
                        await (supabase.from('client_documents') as any).delete().eq('id', doc.id)
                        setExistingDocs(prev => prev.filter(d => d.id !== doc.id))
                      }}
                      className="text-gray-400 hover:text-red-400 transition-colors shrink-0"
                      title="Remover documento"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-2xl border border-gray-200 text-gray-600 text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3.5 rounded-2xl text-white text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
              style={{ background: BRAND }}
              onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.92)')}
              onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Salvando...' : isEdit ? 'Salvar Alterações' : 'Salvar Cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─── Central do Cliente ────────────────────────────────────────────────────────

function ClientDetailModal({ clientId, onClose }: { clientId: string; onClose: () => void }) {
  const [client, setClient]           = useState<any>(null)
  const [contracts, setContracts]     = useState<ClientDetailContract[]>([])
  const [loading, setLoading]         = useState(true)
  const [notes, setNotes]             = useState('')
  const [savingNotes, setSavingNotes] = useState(false)
  const [notesSaved, setNotesSaved]   = useState(false)
  const [editingClient, setEditingClient] = useState(false)
  const [editName, setEditName]       = useState('')
  const [editPhone, setEditPhone]     = useState('')
  const [savingEdit, setSavingEdit]         = useState(false)
  const [showHistory, setShowHistory]       = useState(false)
  const [confirmBlock, setConfirmBlock]     = useState(false)
  const [blockingClient, setBlockingClient] = useState(false)

  useEffect(() => { load() }, [clientId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  async function load() {
    setLoading(true)
    const { data: clientData } = await (supabase.from('clients') as any)
      .select('*')
      .eq('id', clientId)
      .single()
    const { data: contractsData } = await (supabase.from('contracts') as any)
      .select('id, contract_number, total_amount, total_interest, status, archived, contract_date, first_due_date, installments, payment_type')
      .eq('client_id', clientId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
    if (clientData) {
      setClient(clientData)
      setNotes(clientData.notes ?? '')
      setEditName(clientData.name ?? '')
      setEditPhone(clientData.phone ?? '')
    }
    setContracts(contractsData ?? [])
    setLoading(false)
  }

  async function saveNotes() {
    setSavingNotes(true)
    await (supabase.from('clients') as any).update({ notes }).eq('id', clientId)
    setSavingNotes(false)
    setNotesSaved(true)
    setTimeout(() => setNotesSaved(false), 2500)
  }

  async function saveEdit() {
    if (!editName.trim()) return
    setSavingEdit(true)
    await (supabase.from('clients') as any)
      .update({ name: editName.trim(), phone: editPhone.trim() || null })
      .eq('id', clientId)
    setClient((prev: any) => prev ? { ...prev, name: editName.trim(), phone: editPhone.trim() || null } : prev)
    setSavingEdit(false)
    setEditingClient(false)
  }

  async function handleBlock() {
    if (!confirmBlock) { setConfirmBlock(true); return }
    setBlockingClient(true)
    try {
      await (supabase.from('clients') as any)
        .update({ blocked: true })
        .eq('id', clientId)
    } catch { /* silently ignore if column doesn't exist */ }
    setBlockingClient(false)
    onClose()
  }

  // ── Termômetro ──────────────────────────────────────────────────────────────
  const overdueList   = contracts.filter(c => c.status === 'overdue')
  const maxDays       = overdueList.length === 0 ? 0 : Math.max(
    ...overdueList.map(c => {
      if (!c.first_due_date) return 0
      return Math.max(0, Math.floor((Date.now() - new Date(c.first_due_date + 'T00:00:00').getTime()) / 86_400_000))
    })
  )
  const thermoPercent = Math.min(maxDays / 30, 1) * 100
  const thermoColor   = overdueList.length === 0 ? '#22C55E' : maxDays <= 5 ? '#EAB308' : '#EF4444'
  const thermoLabel   = overdueList.length === 0 ? 'Excelente' : maxDays <= 5 ? 'Atenção' : 'Risco'
  const thermoPhrase  = overdueList.length === 0 ? 'Paga sempre no dia' : `${maxDays}d em atraso`

  // ── Métricas ────────────────────────────────────────────────────────────────
  const totalLent    = contracts.reduce((s, c) => s + (c.total_amount ?? 0), 0)
  const totalProfit  = contracts.filter(c => c.status === 'settled').reduce((s, c) => s + (c.total_interest ?? 0), 0)
  const activeCount  = contracts.filter(c => c.status === 'active' || c.status === 'overdue').length
  const settledCount = contracts.filter(c => c.status === 'settled').length
  const overdueCount = contracts.filter(c => c.status === 'overdue').length

  const displayId = client?.display_id != null
    ? '#' + String(client.display_id).replace(/^#+/, '')
    : null
  const waPhone   = client?.phone?.replace(/\D/g, '')
  const waLink    = waPhone ? `https://api.whatsapp.com/send?phone=55${waPhone}` : null

  if (loading) return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-2xl p-10 flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: BRAND, borderTopColor: 'transparent' }} />
        <p className="text-gray-400 text-sm">Carregando dados do cliente...</p>
      </div>
    </div>,
    document.body
  )

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-2xl bg-white rounded-[32px] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">

        {/* ── Cabeçalho ─────────────────────────────────────────────────────── */}
        <div className="px-8 pt-8 pb-6 border-b border-slate-100">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              {/* Avatar */}
              <div
                className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-2xl font-bold shrink-0"
                style={{ background: BRAND }}
              >
                {getInitials(client?.name ?? '?')}
              </div>
              <div className="min-w-0">
                {/* Nome + ID */}
                <div className="flex items-baseline gap-2 flex-wrap">
                  <h2 className="text-2xl font-bold text-gray-900 truncate">{client?.name ?? '—'}</h2>
                  {displayId && <span className="text-sm font-mono text-gray-400">{displayId}</span>}
                </div>
                {/* Telefone / WhatsApp */}
                {client?.phone?.trim() ? (
                  <div className="flex items-center gap-2 mt-1">
                    <Phone className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                    <span className="text-sm text-gray-500">{client.phone.trim()}</span>
                    {waLink && (
                      <a href={waLink} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg hover:bg-emerald-100 transition-colors">
                        <WhatsAppIcon className="w-3 h-3" /> WhatsApp
                      </a>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-gray-300 mt-1">Sem telefone cadastrado</p>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-slate-50 transition-colors shrink-0 mt-0.5">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Termômetro de Risco */}
          <div className="mt-5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Termômetro de Risco</span>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: thermoColor + '22', color: thermoColor }}>
                {thermoLabel}
              </span>
            </div>
            {/* Barra gradiente */}
            <div className="relative h-3 rounded-full" style={{ background: 'linear-gradient(to right, #22c55e, #eab308, #ef4444)' }}>
              <div
                className="absolute top-1/2 w-5 h-5 rounded-full bg-white border-2 shadow-md"
                style={{
                  left: `${thermoPercent}%`,
                  transform: `translateX(-${thermoPercent}%) translateY(-50%)`,
                  borderColor: thermoColor,
                }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Pgt. em dia: <span className="font-semibold text-emerald-600">{settledCount}</span>
              {' · '}
              Pgt. em atraso: <span className="font-semibold text-red-500">{overdueCount}</span>
              <span className="ml-2 text-gray-400">· {thermoPhrase}</span>
            </p>
          </div>
        </div>

        {/* ── Corpo com scroll ───────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto px-8 py-6 flex flex-col gap-6">

          {/* Cards de resumo */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1 bg-slate-50 rounded-2xl px-5 py-4">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Total Emprestado</span>
              <span className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(totalLent)}</span>
              <span className="text-[11px] text-gray-400">Todos os contratos</span>
            </div>
            <div className="flex flex-col gap-1 rounded-2xl px-5 py-4" style={{ background: BRAND + '14' }}>
              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: BRAND }}>Lucro Líquido</span>
              <span className="text-lg font-bold tabular-nums" style={{ color: BRAND }}>{formatCurrency(totalProfit)}</span>
              <span className="text-[11px] text-gray-400">Juros recebidos</span>
            </div>
            <div className="flex flex-col gap-1 bg-slate-50 rounded-2xl px-5 py-4">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Ativos</span>
              <span className="text-lg font-bold text-gray-900">{activeCount}</span>
              <span className="text-[11px] text-gray-400">Em aberto</span>
            </div>
          </div>

          {/* Lista de contratos (toggle) */}
          {showHistory && (
            <div className="flex flex-col gap-4">

              {/* Card de Lucro Acumulado */}
              <div
                className="flex items-center justify-between px-5 py-4 rounded-2xl"
                style={{ background: 'linear-gradient(135deg, #22c55e18, #4ade8018)' }}
              >
                <div>
                  <p className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-0.5">Lucro Total Acumulado</p>
                  <p className="text-2xl font-bold tabular-nums text-emerald-600">{formatCurrency(totalProfit)}</p>
                  <p className="text-xs text-emerald-500 mt-0.5">
                    Soma dos juros de {contracts.filter(c => c.status === 'settled').length} contrato(s) pagos
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#22c55e20' }}>
                  <DollarSign className="w-6 h-6 text-emerald-500" />
                </div>
              </div>

              {/* Tabela de histórico */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  Contratos ({contracts.length})
                </h3>
                {contracts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 gap-2 bg-slate-50 rounded-2xl">
                    <FileText className="w-7 h-7 text-gray-200" />
                    <p className="text-gray-400 text-sm">Nenhum contrato encontrado.</p>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-100 overflow-hidden">
                    {/* Cabeçalho da tabela */}
                    <div className="grid grid-cols-4 gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100">
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Data</span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Valor Total</span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Lucro Gerado</span>
                      <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider text-right">Status</span>
                    </div>
                    {/* Linhas */}
                    <div className="divide-y divide-slate-50">
                      {contracts.map(c => {
                        const isSettled  = c.status === 'settled'
                        const profitColor = isSettled ? '#22C55E' : '#94A3B8'
                        return (
                          <div
                            key={c.id}
                            className="grid grid-cols-4 gap-2 items-center px-4 py-3 hover:bg-slate-50/60 transition-colors"
                            style={c.archived ? { opacity: 0.55 } : {}}
                          >
                            {/* Data */}
                            <div className="flex flex-col">
                              <span className="text-xs text-gray-700 font-medium tabular-nums">
                                {c.contract_date
                                  ? new Date(c.contract_date + 'T00:00:00').toLocaleDateString('pt-BR')
                                  : '—'}
                              </span>
                              {c.contract_number && (
                                <span className="text-[10px] text-gray-400">Nº {c.contract_number}</span>
                              )}
                            </div>
                            {/* Valor Total */}
                            <span className="text-xs font-bold text-gray-900 tabular-nums text-right">
                              {formatCurrency(c.total_amount ?? 0)}
                            </span>
                            {/* Lucro Gerado */}
                            <span className="text-xs font-bold tabular-nums text-right" style={{ color: profitColor }}>
                              {isSettled ? formatCurrency(c.total_interest ?? 0) : '—'}
                            </span>
                            {/* Status */}
                            <div className="flex justify-end">
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${STATUS_STYLE[c.status] ?? 'bg-slate-100 text-slate-400'}`}>
                                {STATUS_LABEL[c.status] ?? c.status}
                              </span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                    {/* Rodapé com totais */}
                    {contracts.length > 1 && (
                      <div className="grid grid-cols-4 gap-2 items-center px-4 py-3 bg-slate-50 border-t border-slate-100">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Total</span>
                        <span className="text-xs font-bold text-gray-900 tabular-nums text-right">{formatCurrency(totalLent)}</span>
                        <span className="text-xs font-bold tabular-nums text-right" style={{ color: '#22C55E' }}>{formatCurrency(totalProfit)}</span>
                        <span />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Form de edição (inline) */}
          {editingClient && (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-gray-700">Editar dados</h3>
              <div className="flex gap-2 flex-wrap">
                <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                  placeholder="Nome completo" className={`${inputCls} px-3 py-2 text-sm flex-1 min-w-[160px]`} />
                <input type="tel" value={editPhone} onChange={e => setEditPhone(e.target.value)}
                  placeholder="WhatsApp" className={`${inputCls} px-3 py-2 text-sm flex-1 min-w-[130px]`} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => setEditingClient(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-500 hover:bg-slate-50">
                  Cancelar
                </button>
                <button onClick={saveEdit} disabled={savingEdit}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5 disabled:opacity-50"
                  style={{ background: BRAND }}>
                  {savingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Salvar
                </button>
              </div>
            </div>
          )}

          {/* Observações */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Observações</h3>
              {notesSaved ? (
                <span className="flex items-center gap-1 text-xs font-semibold" style={{ color: BRAND }}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Salvo
                </span>
              ) : (
                <button onClick={saveNotes} disabled={savingNotes}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl text-white disabled:opacity-50"
                  style={{ background: BRAND }}>
                  {savingNotes ? <Loader2 className="w-3 h-3 animate-spin" /> : <StickyNote className="w-3 h-3" />}
                  Salvar
                </button>
              )}
            </div>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Anote informações importantes sobre este cliente..."
              rows={3} className={`${inputCls} px-4 py-3 resize-none text-sm`}
            />
          </div>

          {/* Botões de ação secundários */}
          <div className="flex flex-col gap-2 pt-2">
            <button
              onClick={() => setShowHistory(v => !v)}
              className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98]"
              style={{ background: BRAND + '18', color: BRAND }}
            >
              <History className="w-4 h-4 shrink-0" />
              {showHistory ? `Ocultar histórico (${contracts.length})` : `Ver histórico do cliente (${contracts.length} contratos)`}
            </button>
            <button
              onClick={() => { setEditingClient(v => !v); setShowHistory(false) }}
              className="w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl text-sm font-semibold bg-slate-100 text-gray-700 hover:bg-slate-200 transition-all active:scale-[0.98]"
            >
              <UserPlus className="w-4 h-4 shrink-0" />
              {editingClient ? 'Cancelar edição' : 'Editar dados do cliente'}
            </button>
          </div>
        </div>

        {/* ── Rodapé fixo — Bloquear Cliente ─────────────────────────────────── */}
        <div className="px-8 py-4 border-t border-red-100 bg-white shrink-0">
          <button
            onClick={handleBlock}
            disabled={blockingClient}
            className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-2xl text-sm font-bold transition-all active:scale-[0.98] disabled:opacity-50"
            style={confirmBlock
              ? { background: '#EF4444', color: '#fff' }
              : { background: '#FEF2F2', color: '#DC2626' }
            }
          >
            {blockingClient
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Lock className="w-4 h-4" />
            }
            {confirmBlock ? '⚠ Confirmar bloqueio — clique novamente' : 'Bloquear cliente'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

// ─── SubscriptionView ─────────────────────────────────────────────────────────

type SubBillingPeriod = 'monthly' | 'quarterly' | 'semiannual' | 'annual'

const SUB_PERIOD_OPTIONS: { value: SubBillingPeriod; label: string; months: number }[] = [
  { value: 'monthly',    label: 'Mensal',     months: 1  },
  { value: 'quarterly',  label: 'Trimestral', months: 3  },
  { value: 'semiannual', label: 'Semestral',  months: 6  },
  { value: 'annual',     label: 'Anual',      months: 12 },
]

const SUB_PERIOD_BILLING_LABEL: Record<SubBillingPeriod, string> = {
  monthly:    'Cobrado mensalmente',
  quarterly:  'Cobrado a cada 3 meses',
  semiannual: 'Cobrado a cada 6 meses',
  annual:     'Cobrado anualmente',
}

function SubscriptionView({
  planName,
  subscriptionStatus,
  subscriptionExpiresAt,
}: {
  planName: PlanName
  subscriptionStatus: 'ativo' | 'pendente' | 'bloqueado'
  subscriptionExpiresAt: string | null
  documentNumber?: string | null
}) {
  const [loadingPay, setLoadingPay] = useState(false)
  const [payResult, setPayResult]   = useState<any>(null)
  const [pixUrl, setPixUrl]         = useState<string | null>(null)
  const [pixCode, setPixCode]       = useState<string | null>(null)
  const [payError, setPayError]     = useState<string | null>(null)
  const [copied, setCopied]         = useState(false)
  const [imgLoaded, setImgLoaded]   = useState(false)
  const [billingPeriod, setBillingPeriod] = useState<SubBillingPeriod>('monthly')
  const [selectedPlan, setSelectedPlan]   = useState<'starter' | 'pro'>(
    planName === 'pro' ? 'pro' : 'starter'
  )
  // allPrices[plan_id][billing_period] = price
  const [allPrices, setAllPrices] = useState<Record<string, Record<string, number>>>({})
  const [planLimits, setPlanLimits] = useState<Record<string, string>>({})

  useEffect(() => {
    async function fetchPrices() {
      const { data } = await (supabase.rpc as any)('get_public_plan_settings')
      if (data && data.length > 0) {
        type Row = { plan_name: string; price: number; contract_limit: number | null; billing_period: string }
        const prices: Record<string, Record<string, number>> = {}
        const limits: Record<string, string> = {}
        for (const row of data as Row[]) {
          const key = row.plan_name.toLowerCase()
          if (!prices[key]) prices[key] = {}
          prices[key][row.billing_period] = Number(row.price)
          if (!limits[key]) {
            limits[key] = (row.contract_limit == null || row.contract_limit >= 999999)
              ? 'Contratos ilimitados'
              : `Até ${row.contract_limit} contratos ativos`
          }
        }
        setAllPrices(prices)
        setPlanLimits(limits)
      }
    }
    fetchPrices()
  }, [])

  const PLAN_INFO = {
    free:    { label: 'Grátis',  badge: '',   color: '#64748B', limit: planLimits['free']    ?? '3 contratos' },
    starter: { label: 'Starter', badge: '🥈', color: '#6B7280', limit: planLimits['starter'] ?? '50 contratos ativos' },
    pro:     { label: 'Pro',     badge: '🥇', color: '#D97706', limit: planLimits['pro']     ?? 'Contratos ilimitados' },
  }

  const SUB_STATUS = {
    ativo:     { label: 'Ativo',     color: '#16a34a', bg: '#22C55E15' },
    pendente:  { label: 'Pendente',  color: '#d97706', bg: '#F59E0B15' },
    bloqueado: { label: 'Bloqueado', color: '#dc2626', bg: '#EF444415' },
  }

  const info   = PLAN_INFO[planName]
  const status = SUB_STATUS[subscriptionStatus]

  const daysLeft = subscriptionExpiresAt
    ? Math.ceil((new Date(subscriptionExpiresAt).getTime() - Date.now()) / 86_400_000)
    : null

  function getPriceForPlan(plan: 'starter' | 'pro', period: SubBillingPeriod): number {
    return allPrices[plan]?.[period] ?? allPrices[plan]?.['monthly'] ?? (plan === 'pro' ? 99.90 : 49.90)
  }

  function savingsPct(plan: 'starter' | 'pro', period: SubBillingPeriod): number {
    if (period === 'monthly') return 0
    const monthly = getPriceForPlan(plan, 'monthly')
    const actual  = getPriceForPlan(plan, period)
    const months  = SUB_PERIOD_OPTIONS.find(p => p.value === period)!.months
    return Math.round((1 - actual / (monthly * months)) * 100)
  }

  async function handleGeneratePayment() {
    setLoadingPay(true)
    setPayError(null)
    setPayResult(null)
    setPixUrl(null)
    setPixCode(null)
    setImgLoaded(false)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const userId = user?.id ?? ''

      const { data: prof } = await (supabase.from('profiles') as any)
        .select('document_number')
        .eq('id', userId)
        .single()

      const docNumber = (prof?.document_number ?? '').replace(/\D/g, '') || undefined

      const { data, error: fnErr } = await (supabase.functions as any).invoke('create-payment', {
        body: { plan_name: selectedPlan, document_number: docNumber, billing_period: billingPeriod },
      })

      if (fnErr) throw fnErr
      if (data?.error) throw new Error(data.error)

      setPayResult(data)
      setPixUrl(data.pix_qr_code_url ?? data.qr_code ?? null)
      setPixCode(data.pix_code ?? data.pix_copy_paste ?? null)
    } catch (e: any) {
      setPayError(e?.message ?? 'Erro ao gerar pagamento. Tente novamente.')
    } finally {
      setLoadingPay(false)
    }
  }

  function copyPix() {
    if (!pixCode) return
    navigator.clipboard.writeText(pixCode).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const currentPrice  = getPriceForPlan(selectedPlan, billingPeriod)
  const periodMonths  = SUB_PERIOD_OPTIONS.find(p => p.value === billingPeriod)!.months

  return (
    <div className="max-w-2xl">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Assinatura</h1>
        <p className="text-gray-400 text-sm mt-0.5">Gerencie seu plano e realize pagamentos</p>
      </div>

      {/* Current plan card */}
      <div className="bg-white rounded-3xl p-6 shadow-sm mb-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Plano atual</p>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center text-xl"
              style={{ background: info.color + '18' }}>
              {info.badge || '🆓'}
            </div>
            <div>
              <p className="font-bold text-gray-900 text-lg">Plano {info.label}</p>
              <p className="text-sm text-gray-400">{info.limit}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl"
              style={{ color: status.color, background: status.bg }}>
              {status.label}
            </span>
            {daysLeft !== null && (
              <p className="text-xs font-semibold"
                style={{ color: daysLeft < 0 ? '#EF4444' : daysLeft <= 7 ? '#F59E0B' : '#22C55E' }}>
                {daysLeft < 0
                  ? `Expirado há ${Math.abs(daysLeft)}d`
                  : daysLeft === 0 ? 'Expira hoje'
                  : `Expira em ${daysLeft}d`}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Upgrade / payment section */}
      {!(planName === 'pro' && subscriptionStatus === 'ativo' && !payResult) && (
        <div className="bg-white rounded-3xl p-6 shadow-sm mb-5">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
            {planName === 'free' ? 'Escolha um plano' : planName === 'starter' ? 'Fazer upgrade' : 'Renovar assinatura'}
          </p>

          {!payResult && (
            <>
              {/* Billing period toggle */}
              <div className="flex gap-1.5 bg-slate-100 rounded-2xl p-1 mb-5">
                {SUB_PERIOD_OPTIONS.map(opt => {
                  const savings = savingsPct(selectedPlan, opt.value)
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setBillingPeriod(opt.value)}
                      className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all relative ${
                        billingPeriod === opt.value
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      {opt.label}
                      {savings > 0 && (
                        <span className="absolute -top-2 -right-1 bg-emerald-500 text-white text-[9px] font-bold px-1 py-0.5 rounded-full leading-none">
                          -{savings}%
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>

              {/* Plan selector */}
              <div className={`grid gap-3 mb-5 ${planName === 'free' ? 'grid-cols-2' : 'grid-cols-1 max-w-xs'}`}>
                {(planName === 'free' ? ['starter', 'pro'] as const : ['pro'] as const).map(p => {
                  const pi     = PLAN_INFO[p]
                  const active = selectedPlan === p
                  const price  = getPriceForPlan(p, billingPeriod)
                  return (
                    <button
                      key={p}
                      onClick={() => { setSelectedPlan(p); setPayResult(null); setPayError(null) }}
                      className="rounded-2xl border-2 p-4 text-left transition-all"
                      style={{
                        borderColor: active ? pi.color : '#E2E8F0',
                        background:  active ? pi.color + '10' : '#fff',
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-base">{pi.badge || '🆓'}</span>
                        <span className="font-bold text-gray-900 text-sm">{pi.label}</span>
                      </div>
                      <p className="text-xs text-gray-400">{pi.limit}</p>
                      <p className="text-sm font-bold mt-1.5" style={{ color: pi.color }}>
                        R$ {price.toFixed(2).replace('.', ',')}
                      </p>
                      {billingPeriod !== 'monthly' && (
                        <p className="text-[11px] text-gray-400">
                          equiv. R$ {(price / periodMonths).toFixed(2).replace('.', ',')}/mês
                        </p>
                      )}
                      <p className="text-[11px] text-gray-400 mt-0.5">{SUB_PERIOD_BILLING_LABEL[billingPeriod]}</p>
                    </button>
                  )
                })}
              </div>

              {/* Generate button */}
              <button
                onClick={handleGeneratePayment}
                disabled={loadingPay}
                className="w-full py-3.5 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-50"
                style={{ background: BRAND }}
                onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.92)')}
                onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
              >
                {loadingPay
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando...</>
                  : `⚡ Assinar ${PLAN_INFO[selectedPlan].label} via Pix`}
              </button>
            </>
          )}

          {/* Error */}
          {payError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3 mt-3">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
              <p className="text-red-500 text-sm">{payError}</p>
              <button onClick={() => setPayError(null)} className="ml-auto text-red-300 hover:text-red-500">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Loading */}
          {loadingPay && (
            <div className="flex flex-col items-center py-10 gap-3 mt-4">
              <Loader2 className="w-10 h-10 animate-spin" style={{ color: BRAND }} />
              <p className="text-sm text-gray-400 font-medium">Gerando QR Code Pix...</p>
            </div>
          )}

          {/* Payment result */}
          {!loadingPay && payResult && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pagamento gerado</p>
                <button onClick={() => { setPayResult(null); setPayError(null); setImgLoaded(false) }} className="text-gray-400 hover:text-gray-600 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {payResult.demo && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3 mb-4">
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-amber-700 text-sm">{payResult.message}</p>
                </div>
              )}

              <div className="flex items-center justify-between bg-slate-50 rounded-2xl px-4 py-3 mb-4">
                <div>
                  <p className="text-sm font-semibold text-gray-800 capitalize">
                    Plano {payResult.plan_name ?? selectedPlan}
                  </p>
                  <p className="text-xs text-gray-400">{SUB_PERIOD_BILLING_LABEL[billingPeriod]}</p>
                </div>
                <p className="text-lg font-bold text-gray-900">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payResult.price ?? currentPrice)}
                </p>
              </div>

              {/* QR Code image */}
              {pixUrl && (
                <div className="flex justify-center mb-4">
                  <div className="relative p-3 bg-white border-2 border-slate-100 rounded-2xl shadow-sm">
                    {!imgLoaded && (
                      <div className="absolute inset-3 flex items-center justify-center bg-slate-50 rounded-xl">
                        <Loader2 className="w-8 h-8 animate-spin text-gray-300" />
                      </div>
                    )}
                    <img
                      src={pixUrl}
                      alt="QR Code Pix"
                      className={`w-44 h-44 object-contain transition-opacity ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
                      onLoad={() => setImgLoaded(true)}
                      onError={() => setImgLoaded(true)}
                    />
                  </div>
                </div>
              )}

              {/* Pix copia e cola */}
              {pixCode && (
                <div className="mb-4">
                  <p className="text-xs text-gray-400 mb-1.5">Pix copia e cola</p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-gray-600 font-mono truncate">
                      {pixCode}
                    </div>
                    <button
                      onClick={copyPix}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold text-white transition-all shrink-0"
                      style={{ background: BRAND }}
                    >
                      {copied ? <CheckCheck className="w-3.5 h-3.5" /> : <Hash className="w-3.5 h-3.5" />}
                      {copied ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}

              {payResult.boleto_url && (
                <a
                  href={payResult.boleto_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-3 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all"
                  style={{ background: '#374151' }}
                >
                  <FileText className="w-4 h-4" />
                  Abrir Boleto
                </a>
              )}

              <p className="text-xs text-gray-400 text-center mt-3">
                Após o pagamento, seu plano será ativado automaticamente em até 5 minutos.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Plano Pro Ativo */}
      {planName === 'pro' && subscriptionStatus === 'ativo' && !payResult && (
        <div className="bg-white rounded-3xl p-6 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Plano Pro Ativo</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-50 flex items-center justify-center text-lg">🥇</div>
            <div>
              <p className="text-sm font-semibold text-gray-800">Você está no plano máximo!</p>
              <p className="text-xs text-gray-400 mt-0.5">Contratos ilimitados e todos os recursos disponíveis.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
