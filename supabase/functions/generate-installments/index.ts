/**
 * Edge Function: generate-installments
 *
 * Responsabilidade: Calcular e persistir atomicamente um contrato + suas parcelas.
 * Nunca calcule parcelas no frontend — essa função é a fonte da verdade.
 *
 * POST /functions/v1/generate-installments
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { addMonths, format, isWeekend, parseISO } from "https://esm.sh/date-fns@3";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface GenerateInstallmentsRequest {
  // Dados do contrato
  client_id: string;
  contract_date: string;           // ISO date: "2025-01-15"
  principal_amount: number;

  interest_type: "percent" | "fixed";
  interest_value: number;          // % ou valor fixo por parcela

  late_fee_enabled: boolean;
  late_fee_daily?: number;

  payment_type: "lump_sum" | "installments";
  installments_count?: number;     // obrigatório se payment_type = "installments"
  first_due_date: string;          // ISO date

  notes?: string;
}

interface InstallmentPreview {
  installment_no: number;
  due_date: string;
  principal: number;
  interest: number;
  total_amount: number;
}

interface GenerateInstallmentsResponse {
  contract_id: string;
  installments: InstallmentPreview[];
  summary: {
    total_principal: number;
    total_interest: number;
    total_amount: number;
    installments_count: number;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Arredonda para 2 casas decimais usando método "half away from zero"
 * Evita o bug clássico de floating point no JS.
 */
function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Distribui o resíduo de centavos na última parcela.
 * Garante que sum(parcelas) == total exato.
 */
function distributeRemainder(
  values: number[],
  expectedTotal: number
): number[] {
  const sum = values.reduce((a, b) => a + b, 0);
  const remainder = round2(expectedTotal - sum);
  const result = [...values];
  result[result.length - 1] = round2(result[result.length - 1] + remainder);
  return result;
}

/**
 * Retorna um aviso se a data cair em fim de semana.
 * Não ajusta automaticamente — a decisão é do usuário.
 */
function getDateWarnings(dates: Date[]): string[] {
  return dates
    .filter(isWeekend)
    .map((d) => `Parcela vence em ${format(d, "dd/MM/yyyy")} (fim de semana)`);
}

/**
 * Calcula as parcelas de acordo com os parâmetros do contrato.
 *
 * Método: Juros Simples (adequado para empréstimos pessoais informais).
 * Para Tabela Price (amortização), ver comentário ao final do arquivo.
 */
function calculateInstallments(
  params: GenerateInstallmentsRequest
): { installments: InstallmentPreview[]; warnings: string[] } {
  const {
    principal_amount,
    interest_type,
    interest_value,
    payment_type,
    installments_count,
    first_due_date,
  } = params;

  const firstDue = parseISO(first_due_date);
  const count = payment_type === "lump_sum" ? 1 : installments_count!;

  // ── Cálculo de juros por parcela ──────────────────────────────────────────

  let interestPerInstallment: number;

  if (interest_type === "percent") {
    // Ex: 5% sobre o principal total, por parcela
    interestPerInstallment = round2(principal_amount * (interest_value / 100));
  } else {
    // Valor fixo por parcela (ex: R$ 50,00/mês)
    interestPerInstallment = round2(interest_value);
  }

  // ── Distribuição do principal ─────────────────────────────────────────────

  const principalPerInstallment = round2(principal_amount / count);
  const principals = distributeRemainder(
    Array(count).fill(principalPerInstallment),
    principal_amount
  );

  // ── Montagem das parcelas ─────────────────────────────────────────────────

  const dueDates = Array.from({ length: count }, (_, i) =>
    addMonths(firstDue, i)
  );

  const installments: InstallmentPreview[] = dueDates.map((date, i) => {
    const principal = principals[i];
    const interest = interestPerInstallment;
    return {
      installment_no: i + 1,
      due_date: format(date, "yyyy-MM-dd"),
      principal,
      interest,
      total_amount: round2(principal + interest),
    };
  });

  const warnings = getDateWarnings(dueDates);

  return { installments, warnings };
}

// ─── Validação ────────────────────────────────────────────────────────────────

function validate(req: GenerateInstallmentsRequest): string | null {
  if (!req.client_id) return "client_id é obrigatório";
  if (!req.principal_amount || req.principal_amount <= 0)
    return "principal_amount deve ser maior que zero";
  if (!["percent", "fixed"].includes(req.interest_type))
    return "interest_type inválido";
  if (req.interest_value < 0) return "interest_value não pode ser negativo";
  if (!["lump_sum", "installments"].includes(req.payment_type))
    return "payment_type inválido";
  if (req.payment_type === "installments") {
    if (!req.installments_count || req.installments_count < 2)
      return "installments_count deve ser >= 2 para pagamento a prazo";
  }
  if (req.late_fee_enabled && (!req.late_fee_daily || req.late_fee_daily <= 0))
    return "late_fee_daily deve ser > 0 quando mora está ativada";
  if (!req.first_due_date || isNaN(parseISO(req.first_due_date).getTime()))
    return "first_due_date inválido";

  return null;
}

// ─── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS para desenvolvimento local
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
    });
  }

  // ── Autenticação via JWT do Supabase ──────────────────────────────────────

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Não autorizado" }), {
      status: 401,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Token inválido" }), {
      status: 401,
    });
  }

  // ── Parse e validação do body ─────────────────────────────────────────────

  let body: GenerateInstallmentsRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body inválido (JSON)" }), {
      status: 400,
    });
  }

  const validationError = validate(body);
  if (validationError) {
    return new Response(JSON.stringify({ error: validationError }), {
      status: 422,
    });
  }

  // ── Cálculo das parcelas ──────────────────────────────────────────────────

  const { installments, warnings } = calculateInstallments(body);

  const totalPrincipal = round2(
    installments.reduce((s, i) => s + i.principal, 0)
  );
  const totalInterest = round2(
    installments.reduce((s, i) => s + i.interest, 0)
  );
  const totalAmount = round2(totalPrincipal + totalInterest);

  // ── Persistência atômica: contrato + parcelas ─────────────────────────────
  // Usamos uma RPC (função SQL) para garantir que tudo vai em uma única transação.

  const { data: contractId, error: rpcError } = await supabase.rpc(
    "create_contract_with_installments",
    {
      p_user_id: user.id,
      p_client_id: body.client_id,
      p_contract_date: body.contract_date,
      p_principal_amount: body.principal_amount,
      p_interest_type: body.interest_type,
      p_interest_value: body.interest_value,
      p_late_fee_enabled: body.late_fee_enabled,
      p_late_fee_daily: body.late_fee_daily ?? null,
      p_payment_type: body.payment_type,
      p_installments_count:
        body.payment_type === "lump_sum" ? null : body.installments_count,
      p_first_due_date: body.first_due_date,
      p_total_amount: totalAmount,
      p_total_interest: totalInterest,
      p_notes: body.notes ?? null,
      p_installments: installments,
    }
  );

  if (rpcError) {
    console.error("RPC error:", rpcError);
    return new Response(
      JSON.stringify({ error: "Erro ao persistir contrato", detail: rpcError.message }),
      { status: 500 }
    );
  }

  const response: GenerateInstallmentsResponse & { warnings: string[] } = {
    contract_id: contractId,
    installments,
    summary: {
      total_principal: totalPrincipal,
      total_interest: totalInterest,
      total_amount: totalAmount,
      installments_count: installments.length,
    },
    warnings, // ex: ["Parcela 3 vence em sábado"]
  };

  return new Response(JSON.stringify(response), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
});

// =============================================================================
// APÊNDICE: Tabela Price (amortização francesa) — para versão futura
// =============================================================================
//
// Na Tabela Price, a prestação (PMT) é constante e calculada por:
//
//   PMT = PV * [i * (1+i)^n] / [(1+i)^n - 1]
//
//   Onde:
//   PV = principal_amount
//   i  = taxa de juros por período (ex: 0.05 para 5% ao mês)
//   n  = número de parcelas
//
// Cada parcela tem juros decrescentes e amortização crescente.
// Para MVP com empréstimos pessoais informais, juros simples são mais comuns.
// Ative Tabela Price apenas se o público exigir.
