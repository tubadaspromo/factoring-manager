import { Bell } from 'lucide-react'

const BRAND = '#4ABCB1'

interface DueContract {
  id: string
  client_name: string
  client_phone: string | null
  total_amount: number
  contract_number: string | null
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  )
}

export function DailyAlerts({ contracts }: {
  contracts: { id: string; client_name: string; client_phone: string | null; total_amount: number; first_due_date: string | null; contract_number: string | null; status: string }[]
}) {
  const todayStr = new Date().toISOString().split('T')[0]

  const dueToday: DueContract[] = contracts
    .filter(c => c.first_due_date === todayStr && (c.status === 'active' || c.status === 'overdue'))
    .map(c => ({
      id:              c.id,
      client_name:     c.client_name,
      client_phone:    c.client_phone,
      total_amount:    c.total_amount,
      contract_number: c.contract_number,
    }))

  if (dueToday.length === 0) return null

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <Bell className="w-4 h-4" style={{ color: BRAND }} />
        <h2 className="text-sm font-semibold text-gray-700">Vencimentos de Hoje</h2>
        <span
          className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white"
          style={{ background: BRAND }}
        >
          {dueToday.length}
        </span>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
        {dueToday.map(c => {
          const phone = c.client_phone?.replace(/\D/g, '')
          const msg = encodeURIComponent(
            `Olá ${c.client_name}, lembramos que seu contrato ${c.contract_number ?? ''} de ${formatCurrency(c.total_amount)} vence hoje. Por favor, entre em contato para regularizar. Obrigado!`
          )
          const waLink = phone ? `https://api.whatsapp.com/send?phone=55${phone}&text=${msg}` : null

          return (
            <div
              key={c.id}
              className="shrink-0 bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-3.5 flex flex-col gap-2.5 w-56"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.client_name}</p>
                  {c.contract_number && (
                    <p className="text-[11px] font-mono text-gray-400">{c.contract_number}</p>
                  )}
                </div>
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{ background: '#FEF9C3', color: '#CA8A04' }}
                >
                  Hoje
                </span>
              </div>

              <p className="text-base font-bold tabular-nums" style={{ color: BRAND }}>
                {formatCurrency(c.total_amount)}
              </p>

              {waLink ? (
                <a
                  href={waLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full py-2 rounded-xl text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors"
                >
                  <WhatsAppIcon className="w-3.5 h-3.5" />
                  Cobrar via WhatsApp
                </a>
              ) : (
                <div className="flex items-center justify-center py-2 rounded-xl text-xs text-gray-300 bg-slate-50">
                  Sem telefone cadastrado
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
