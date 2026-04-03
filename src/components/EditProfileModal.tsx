import { useState } from 'react'
import { X, Mail, FileText, Loader2, CheckCircle2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const BRAND = '#4ABCB1'

function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length === 0) return ''
  if (d.length <= 2)  return `(${d}`
  if (d.length <= 7)  return `(${d.slice(0, 2)}) ${d.slice(2)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

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

export interface ProfileData {
  full_name:       string | null
  phone:           string | null
  email:           string
  document_number: string | null
  document_type:   string | null
  userId:          string
}

export function EditProfileModal({
  profile,
  onClose,
  onSaved,
}: {
  profile:  ProfileData
  onClose:  () => void
  onSaved:  (updated: Partial<ProfileData>) => void
}) {
  const hasDoc = !!profile.document_number

  const [docInput, setDocInput] = useState(
    hasDoc ? maskDocument(profile.document_number!) : ''
  )
  const [loading, setLoading] = useState(false)
  const [saved,   setSaved]   = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()

    const docDigits = docInput.replace(/\D/g, '')
    if (!hasDoc) {
      if (!docDigits) { setError('CPF/CNPJ é obrigatório.'); return }
      if (docDigits.length !== 11 && docDigits.length !== 14) {
        setError('CPF deve ter 11 dígitos ou CNPJ 14 dígitos.'); return
      }
    }

    setLoading(true)
    setError(null)

    const updates: Record<string, unknown> = {}
    if (!hasDoc && docDigits) {
      updates.document_number = docDigits
      updates.document_type   = docDigits.length === 14 ? 'cnpj' : 'cpf'
    }

    const { error: dbErr } = await (supabase.from('profiles') as any)
      .update(updates)
      .eq('id', profile.userId)

    if (dbErr) {
      setError(`Erro ao salvar: ${dbErr.message}`)
    } else {
      onSaved({
        ...(!hasDoc && docDigits ? {
          document_number: docDigits,
          document_type:   docDigits.length === 14 ? 'cnpj' : 'cpf',
        } : {}),
      })
      setSaved(true)
      setTimeout(onClose, 1200)
    }
    setLoading(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white w-full max-w-sm rounded-[28px] shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-gray-900">Meu Perfil</h2>
            <p className="text-xs text-gray-400 mt-0.5">{profile.email}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="px-6 py-5 flex flex-col gap-4">

          {/* E-mail (readonly para referência) */}
          <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 rounded-2xl">
            <Mail className="w-4 h-4 text-gray-300 shrink-0" />
            <span className="text-sm text-gray-400 truncate">{profile.email}</span>
          </div>

          {/* CPF / CNPJ — único campo editável, obrigatório */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5" />
              {profile.document_type === 'cnpj' ? 'CNPJ' : 'CPF'}
              {!hasDoc && <span className="text-red-400 font-normal normal-case">* obrigatório</span>}
            </label>
            <input
              type="text"
              value={docInput}
              readOnly={hasDoc}
              onChange={hasDoc ? undefined : e => setDocInput(maskDocument(e.target.value))}
              placeholder={hasDoc ? undefined : '000.000.000-00'}
              autoFocus={!hasDoc}
              className={`w-full px-4 py-3 border rounded-2xl text-sm font-mono transition-all
                ${hasDoc
                  ? 'border-gray-100 text-gray-400 bg-slate-50 cursor-not-allowed'
                  : 'border-gray-200 text-gray-900 focus:outline-none focus:border-[#4ABCB1] focus:ring-4 focus:ring-[#4ABCB115]'
                }`}
            />
            {hasDoc
              ? <p className="text-[11px] text-gray-400 pl-1">Alterações no documento devem ser feitas pelo suporte.</p>
              : <p className="text-[11px] text-amber-600 pl-1">Necessário para habilitar o pagamento do plano via Pix.</p>
            }
          </div>

          {error && (
            <p className="text-sm text-red-500 bg-red-50 rounded-xl px-3 py-2">{error}</p>
          )}

          {!hasDoc && (
            <button
              type="submit"
              disabled={loading || saved}
              className="w-full py-3 rounded-2xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ background: saved ? '#10b981' : BRAND }}
            >
              {loading
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : saved
                  ? <><CheckCircle2 className="w-4 h-4" /> Salvo!</>
                  : 'Salvar CPF'
              }
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
