/**
 * Edge Function: calculate-late-fee
 *
 * Responsabilidade: Calcular a mora acumulada de uma parcela em atraso
 * e registrar o pagamento (parcela + mora) de forma atômica.
 *
 * POST /functions/v1/calculate-late-fee
 *
 * Fluxo de uso:
 *   1. GET /calculate-late-fee?installment_id=xxx  → preview da mora até hoje
 *   2. POST /calculate-late-fee                    → registra o pagamento com mora
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { differenceInDays, parseISO, startOfDay } from "https://esm.sh/date-fns@3";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface InstallmentRow {
  id: string;
  contract_id: string;
  due_date: string;
  total_amount: number;
  status: string;
  paid_amount: number | null;
  contracts: {
    late_fee_enabled: boolean;
    late_fee_daily: number | null;
    user_id: string;
  };
}

interface LateFeePreview {
  installment_id: string;
  due_date: string;
  days_overdue: number;
  installment_amount: number;
  late_fee_per_day: number;
  late_fee_total: number;
  total_to_pay: number;
}

interface RegisterPaymentRequest {
  installment_id: string;
  paid_amount: number;        // valor efetivamente pago (pode ser parcial)
  payment_date?: string;      // default: hoje
  notes?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Calcula dias de atraso entre due_date e payment_date.
 * Usa início do dia (meia-noite) para evitar divergência por horário.
 */
function calcDaysOverdue(dueDate: string, paymentDate: Date): number {
  const due = startOfDay(parseISO(dueDate));
  const payment = startOfDay(paymentDate);
  const days = differenceInDays(payment, due);
  return Math.max(0, days); // nunca negativo
}

function calcLateFee(daysOverdue: number, dailyFee: number): number {
  return round2(daysOverdue * dailyFee);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  // ── Autenticação ──────────────────────────────────────────────────────────

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

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Token inválido" }), {
      status: 401,
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // GET: Preview da mora (sem persistir)
  // ────────────────────────────────────────────────────────────────────────────

  if (req.method === "GET") {
    const url = new URL(req.url);
    const installmentId = url.searchParams.get("installment_id");

    if (!installmentId) {
      return new Response(
        JSON.stringify({ error: "installment_id é obrigatório" }),
        { status: 400 }
      );
    }

    const { data: installment, error } = await supabase
      .from("installments")
      .select(`
        id, contract_id, due_date, total_amount, status, paid_amount,
        contracts ( late_fee_enabled, late_fee_daily, user_id )
      `)
      .eq("id", installmentId)
      .single<InstallmentRow>();

    if (error || !installment) {
      return new Response(JSON.stringify({ error: "Parcela não encontrada" }), {
        status: 404,
      });
    }

    // Garante que o usuário é dono do contrato
    if (installment.contracts.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403,
      });
    }

    if (!installment.contracts.late_fee_enabled) {
      return new Response(
        JSON.stringify({
          installment_id: installmentId,
          late_fee_enabled: false,
          late_fee_total: 0,
          total_to_pay: installment.total_amount,
          days_overdue: 0,
        })
      );
    }

    const today = new Date();
    const daysOverdue = calcDaysOverdue(installment.due_date, today);
    const dailyFee = installment.contracts.late_fee_daily!;
    const lateFeeTotal = calcLateFee(daysOverdue, dailyFee);

    const remainingAmount = round2(
      installment.total_amount - (installment.paid_amount ?? 0)
    );

    const preview: LateFeePreview = {
      installment_id: installmentId,
      due_date: installment.due_date,
      days_overdue: daysOverdue,
      installment_amount: remainingAmount,
      late_fee_per_day: dailyFee,
      late_fee_total: lateFeeTotal,
      total_to_pay: round2(remainingAmount + lateFeeTotal),
    };

    return new Response(JSON.stringify(preview), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // ────────────────────────────────────────────────────────────────────────────
  // POST: Registrar pagamento com mora calculada
  // ────────────────────────────────────────────────────────────────────────────

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
    });
  }

  let body: RegisterPaymentRequest;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Body inválido (JSON)" }), {
      status: 400,
    });
  }

  if (!body.installment_id) {
    return new Response(
      JSON.stringify({ error: "installment_id é obrigatório" }),
      { status: 400 }
    );
  }
  if (!body.paid_amount || body.paid_amount <= 0) {
    return new Response(
      JSON.stringify({ error: "paid_amount deve ser maior que zero" }),
      { status: 400 }
    );
  }

  // ── Busca parcela com contrato ────────────────────────────────────────────

  const { data: installment, error: fetchError } = await supabase
    .from("installments")
    .select(`
      id, contract_id, due_date, total_amount, status, paid_amount,
      contracts ( late_fee_enabled, late_fee_daily, user_id )
    `)
    .eq("id", body.installment_id)
    .single<InstallmentRow>();

  if (fetchError || !installment) {
    return new Response(JSON.stringify({ error: "Parcela não encontrada" }), {
      status: 404,
    });
  }

  if (installment.contracts.user_id !== user.id) {
    return new Response(JSON.stringify({ error: "Acesso negado" }), {
      status: 403,
    });
  }

  if (installment.status === "paid") {
    return new Response(
      JSON.stringify({ error: "Parcela já está quitada" }),
      { status: 409 }
    );
  }

  // ── Cálculo final da mora ─────────────────────────────────────────────────

  const paymentDate = body.payment_date
    ? parseISO(body.payment_date)
    : new Date();

  let lateFeeApplied = 0;

  if (installment.contracts.late_fee_enabled) {
    const daysOverdue = calcDaysOverdue(installment.due_date, paymentDate);
    lateFeeApplied = calcLateFee(daysOverdue, installment.contracts.late_fee_daily!);
  }

  // ── Determina status pós-pagamento ────────────────────────────────────────

  const previouslyPaid = installment.paid_amount ?? 0;
  const totalPaid = round2(previouslyPaid + body.paid_amount);
  const totalDue = round2(installment.total_amount + lateFeeApplied);
  const isFullyPaid = totalPaid >= totalDue;

  // ── Persiste pagamento + atualiza parcela (via RPC atômica) ───────────────

  const { error: rpcError } = await supabase.rpc("register_installment_payment", {
    p_installment_id: body.installment_id,
    p_paid_amount: body.paid_amount,
    p_late_fee: lateFeeApplied,
    p_payment_date: paymentDate.toISOString(),
    p_is_fully_paid: isFullyPaid,
    p_notes: body.notes ?? null,
  });

  if (rpcError) {
    console.error("RPC error:", rpcError);
    return new Response(
      JSON.stringify({ error: "Erro ao registrar pagamento", detail: rpcError.message }),
      { status: 500 }
    );
  }

  return new Response(
    JSON.stringify({
      success: true,
      installment_id: body.installment_id,
      paid_amount: body.paid_amount,
      late_fee_applied: lateFeeApplied,
      total_paid: totalPaid,
      status: isFullyPaid ? "paid" : "partial",
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
});
