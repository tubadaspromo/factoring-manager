import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff, FileText, Loader2, Phone, Ticket, User, Zap } from 'lucide-react'

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  if (digits.length <= 2)  return `(${digits}`
  if (digits.length <= 7)  return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  return value
}

function onlyDigits(v: string) { return v.replace(/\D/g, '') }

function formatDocument(raw: string): string {
  const d = onlyDigits(raw).slice(0, 14)
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

type AuthMode = 'login' | 'register' | 'forgot'

const BRAND = '#4ABCB1'
const BRAND_LIGHT = '#4ABCB115'
const BRAND_BORDER = '#4ABCB140'

const inputBase =
  'w-full bg-white border border-gray-200 rounded-2xl text-gray-900 text-sm placeholder:text-gray-400 focus:outline-none transition-all'

const inputFocus =
  `focus:border-[#4ABCB1] focus:ring-4 focus:ring-[#4ABCB115]`

export function AuthPage() {
  const [mode, setMode] = useState<AuthMode>('login')

  // Login / Forgot
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Register only
  const [fullName, setFullName]           = useState('')
  const [phone, setPhone]                 = useState('')
  const [docInput, setDocInput]           = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [refCode, setRefCode]             = useState('')

  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [success, setSuccess]   = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const ref = params.get('ref')
    if (ref) {
      setRefCode(ref)
      setMode('register')
      localStorage.setItem('affiliate_ref', ref)
    } else {
      const stored = localStorage.getItem('affiliate_ref')
      if (stored) setRefCode(stored)
    }
  }, [])

  function switchMode(next: AuthMode) {
    setMode(next)
    setError(null)
    setSuccess(null)
    setPassword('')
    setConfirmPassword('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(null)

    // ── Redefinir senha ──────────────────────────────────────────────────────
    if (mode === 'forgot') {
      if (!email) { setError('Digite seu e-mail.'); return }
      setLoading(true)
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })
      setLoading(false)
      if (error) { console.error('[Auth] resetPassword error:', error); setError(translateError(error.message)) }
      else setSuccess(`Link enviado para ${email}. Verifique sua caixa de entrada.`)
      return
    }

    // ── Validações comuns ─────────────────────────────────────────────────────
    if (!email || !password) { setError('Preencha e-mail e senha.'); return }

    // ── Validações de cadastro ────────────────────────────────────────────────
    if (mode === 'register') {
      if (!fullName.trim())    { setError('Informe seu nome completo.'); return }
      if (password.length < 6) { setError('A senha deve ter no mínimo 6 caracteres.'); return }
      if (password !== confirmPassword) { setError('As senhas não coincidem.'); return }
      const docDigits = onlyDigits(docInput)
      if (docDigits.length !== 11 && docDigits.length !== 14) {
        setError('Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.')
        return
      }
    }

    setLoading(true)

    // ── Login ─────────────────────────────────────────────────────────────────
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) { console.error('[Auth] signIn error:', error); setError(translateError(error.message)) }

    // ── Cadastro ──────────────────────────────────────────────────────────────
    } else {
      const docDigits = onlyDigits(docInput)
      const docType   = docDigits.length === 14 ? 'cnpj' : 'cpf'
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name:       fullName.trim(),
            phone:           phone.trim() || null,
            document_number: docDigits,
            document_type:   docType,
          },
        },
      })
      if (error) {
        console.error('[Auth] signUp error:', error)
        setError(translateError(error.message))
      } else {
        setSuccess('Conta criada! Verifique seu e-mail para confirmar o cadastro.')
        setEmail(''); setPassword(''); setConfirmPassword('')
        setFullName(''); setPhone(''); setDocInput(''); setRefCode('')
        // Create referral record if came from affiliate link
        const storedRef = refCode || localStorage.getItem('affiliate_ref') || ''
        if (storedRef) {
          try {
            const { data: affCode } = await (supabase.from('affiliate_codes') as any)
              .select('user_id')
              .eq('code', storedRef.toUpperCase())
              .single()
            if (affCode?.user_id) {
              await (supabase.from('referrals') as any).insert({
                affiliate_user_id: affCode.user_id,
                referred_email: email,
                status: 'pending',
              })
            }
            localStorage.removeItem('affiliate_ref')
          } catch (e) { console.error('[referral]', e) }
        }
      }
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">

      {/* Card */}
      <div className="bg-white w-full max-w-md rounded-[32px] shadow-sm p-10">

        {/* Logo */}
        <div className="flex items-center gap-2 mb-8">
          <Zap className="w-5 h-5" style={{ fill: BRAND, color: BRAND }} strokeWidth={0} />
          <span className="text-gray-900 font-bold tracking-tight text-lg">Factoring</span>
        </div>

        {/* Título */}
        <div className="mb-7">
          <h1 className="text-2xl font-semibold text-gray-900 mb-1.5">
            {mode === 'login'    && 'Bem-vindo de volta'}
            {mode === 'register' && 'Crie sua conta'}
            {mode === 'forgot'   && 'Redefinir senha'}
          </h1>
          <p className="text-gray-500 text-sm">
            {mode === 'login'    && 'Acesse agora com seu e-mail e senha'}
            {mode === 'register' && 'Preencha os dados abaixo para começar'}
            {mode === 'forgot'   && 'Enviaremos um link de redefinição para seu e-mail'}
          </p>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">

          {/* ── CAMPOS EXCLUSIVOS DO CADASTRO ───────────────────────────── */}
          {mode === 'register' && (
            <>
              {/* Nome Completo */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">Nome completo</label>
                <div className="relative">
                  <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Seu nome completo"
                    autoComplete="name"
                    className={`${inputBase} ${inputFocus} pl-10 px-4 py-3.5`}
                  />
                </div>
              </div>

              {/* WhatsApp */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">WhatsApp</label>
                <div className="relative">
                  <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={e => setPhone(formatPhone(e.target.value))}
                    placeholder="(11) 99999-9999"
                    autoComplete="tel"
                    className={`${inputBase} ${inputFocus} pl-10 px-4 py-3.5`}
                  />
                </div>
              </div>

              {/* CPF / CNPJ */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-gray-700">
                  CPF ou CNPJ <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <FileText className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    inputMode="numeric"
                    value={docInput}
                    onChange={e => setDocInput(formatDocument(e.target.value))}
                    placeholder="000.000.000-00"
                    autoComplete="off"
                    className={`${inputBase} ${inputFocus} pl-10 px-4 py-3.5`}
                  />
                </div>
                <p className="text-xs text-gray-400 pl-1">Necessário para pagamentos via Pix.</p>
              </div>
            </>
          )}

          {/* ── E-MAIL ──────────────────────────────────────────────────── */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">E-mail</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="email@email.com"
              autoComplete="email"
              className={`${inputBase} ${inputFocus} px-4 py-3.5`}
            />
          </div>

          {/* ── SENHA ───────────────────────────────────────────────────── */}
          {mode !== 'forgot' && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-700">Senha</label>
                {mode === 'login' && (
                  <button
                    type="button"
                    onClick={() => switchMode('forgot')}
                    className="text-xs text-gray-400 hover:underline transition-colors"
                    style={{ color: BRAND }}
                  >
                    Esqueceu sua senha?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className={`${inputBase} ${inputFocus} px-4 py-3.5 pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-500 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {/* ── CONFIRMAR SENHA ──────────────────────────────────────────── */}
          {mode === 'register' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Confirmar senha</label>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="new-password"
                className={`${inputBase} ${inputFocus} px-4 py-3.5`}
              />
            </div>
          )}

          {/* ── CÓDIGO DE AFILIADO (opcional, pré-preenchido via URL) ──────── */}
          {mode === 'register' && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">
                Código de indicação{' '}
                <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <div className="relative">
                <Ticket className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={refCode}
                  onChange={e => setRefCode(e.target.value.toUpperCase())}
                  placeholder="Ex: ABC123"
                  className={`${inputBase} ${inputFocus} pl-10 px-4 py-3.5`}
                />
              </div>
              {refCode && (
                <p className="text-xs pl-1" style={{ color: '#4ABCB1' }}>
                  ✓ Você foi indicado por um parceiro!
                </p>
              )}
            </div>
          )}

          {/* ── ERRO ─────────────────────────────────────────────────────── */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-100 rounded-2xl px-4 py-3">
              <span className="text-red-400 text-sm mt-px">⚠</span>
              <p className="text-red-500 text-sm">{error}</p>
            </div>
          )}

          {/* ── SUCESSO ──────────────────────────────────────────────────── */}
          {success && (
            <div
              className="flex items-start gap-2 rounded-2xl px-4 py-3"
              style={{ background: BRAND_LIGHT, border: `1px solid ${BRAND_BORDER}` }}
            >
              <span className="text-sm mt-px" style={{ color: BRAND }}>✓</span>
              <p className="text-sm" style={{ color: BRAND }}>
                {success}
              </p>
            </div>
          )}

          {/* ── BOTÃO PRINCIPAL ──────────────────────────────────────────── */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 text-white font-semibold text-sm rounded-2xl transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-1"
            style={{ background: BRAND }}
            onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.92)')}
            onMouseLeave={e => (e.currentTarget.style.filter = 'brightness(1)')}
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {loading
              ? 'Aguarde...'
              : { login: 'Entrar', register: 'Criar conta', forgot: 'Enviar link' }[mode]}
          </button>
        </form>

        {/* Switch de modo */}
        <p className="text-center text-sm text-gray-500 mt-6">
          {mode === 'login' && (
            <>Não tem uma conta?{' '}
              <button
                onClick={() => switchMode('register')}
                className="font-semibold hover:underline"
                style={{ color: BRAND }}
              >
                Criar conta
              </button>
            </>
          )}
          {mode === 'register' && (
            <>Já tem uma conta?{' '}
              <button
                onClick={() => switchMode('login')}
                className="font-semibold hover:underline"
                style={{ color: BRAND }}
              >
                Entrar
              </button>
            </>
          )}
          {mode === 'forgot' && (
            <button
              onClick={() => switchMode('login')}
              className="font-semibold hover:underline"
              style={{ color: BRAND }}
            >
              ← Voltar ao login
            </button>
          )}
        </p>
      </div>

      {/* Termos */}
      <p className="text-center text-xs text-gray-400 mt-6 leading-relaxed">
        Ao continuar, você concorda com os{' '}
        <a href="#" className="font-medium hover:underline" style={{ color: BRAND }}>
          Termos de Serviço
        </a>
        {' '}e{' '}
        <a href="#" className="font-medium hover:underline" style={{ color: BRAND }}>
          Política de Privacidade
        </a>.
      </p>
    </div>
  )
}

function translateError(msg: string): string {
  if (msg.includes('Invalid login credentials'))  return 'E-mail ou senha incorretos.'
  if (msg.includes('Email not confirmed'))        return 'Confirme seu e-mail antes de entrar.'
  if (msg.includes('User already registered'))    return 'Este e-mail já possui uma conta.'
  if (msg.includes('Password should be'))         return 'A senha deve ter no mínimo 6 caracteres.'
  if (msg.includes('Unable to validate'))         return 'E-mail inválido.'
  if (msg.includes('rate limit'))                 return 'Muitas tentativas. Aguarde alguns minutos.'
  return msg
}
