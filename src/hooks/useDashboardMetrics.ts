/**
 * useDashboardMetrics
 *
 * Hook que agrega os dados do dashboard em tempo real via TanStack Query + Supabase.
 *
 * Métricas calculadas:
 * - capitalExposto:  Σ principal_amount de contratos ativos (capital em risco)
 * - totalAReceber:   Σ outstanding_balance de contratos ativos + em atraso
 * - totalJuros:      Σ total_interest de contratos ativos
 * - totalClientes:   COUNT DISTINCT client_id de contratos ativos
 * - totalContratos:  COUNT de contratos ativos
 * - overdueCount:    COUNT de contratos com status 'overdue'
 * - settledTotal:    Σ total_amount de contratos liquidados (no mês)
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { DashboardContractRow, ContractStatus } from "@/types/database.types";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface DashboardMetrics {
  capitalExposto: number;
  totalAReceber: number;
  totalJuros: number;
  totalClientes: number;
  totalContratos: number;
  overdueContratos: number;
  overdueAmount: number;
  settledThisMonth: number;
  recoveryRate: number;        // % pago do total emprestado (histórico)
  trend: {
    capitalExposto: number;    // % vs. mês anterior (null se sem dados)
    totalAReceber: number;
  };
}

export interface DashboardFilters {
  status?: ContractStatus[];
  clientId?: string;
  dateFrom?: string;
  dateTo?: string;
}

// ─── Funções de agregação (puras — testáveis isoladamente) ────────────────────

export function computeMetrics(contracts: DashboardContractRow[]): DashboardMetrics {
  const active = contracts.filter((c) =>
    c.status === "active" || c.status === "overdue"
  );
  const overdue = contracts.filter((c) => c.status === "overdue");
  const settled = contracts.filter((c) => c.status === "settled");

  const capitalExposto = active.reduce(
    (sum, c) => sum + (c.principal_amount ?? 0),
    0
  );

  const totalAReceber = active.reduce(
    (sum, c) => sum + (c.outstanding_balance ?? 0),
    0
  );

  const totalJuros = active.reduce(
    (sum, c) => sum + (c.total_interest ?? 0),
    0
  );

  const overdueAmount = overdue.reduce(
    (sum, c) => sum + (c.outstanding_balance ?? 0),
    0
  );

  const settledThisMonth = settled
    .filter((c) => isThisMonth(c.contract_date))
    .reduce((sum, c) => sum + (c.total_amount ?? 0), 0);

  // Taxa de recuperação: quanto do capital emprestado (histórico) já foi recebido
  const totalEmprestado = contracts.reduce(
    (sum, c) => sum + (c.principal_amount ?? 0),
    0
  );
  const totalRecebido = totalEmprestado - capitalExposto;
  const recoveryRate =
    totalEmprestado > 0 ? (totalRecebido / totalEmprestado) * 100 : 0;

  const clientIds = new Set(contracts.map((c) => c.client_name)); // fallback sem client_id na view

  return {
    capitalExposto,
    totalAReceber,
    totalJuros,
    totalClientes: clientIds.size,
    totalContratos: active.length,
    overdueContratos: overdue.length,
    overdueAmount,
    settledThisMonth,
    recoveryRate,
    trend: {
      capitalExposto: 0, // calculado em separado — ver useTrend
      totalAReceber: 0,
    },
  };
}

function isThisMonth(dateStr: string): boolean {
  const date = new Date(dateStr);
  const now = new Date();
  return (
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear()
  );
}

// ─── Fetcher ──────────────────────────────────────────────────────────────────

async function fetchDashboardContracts(
  filters?: DashboardFilters
): Promise<DashboardContractRow[]> {
  let query = supabase
    .from("dashboard_contracts")
    .select("*")
    .order("contract_date", { ascending: false });

  if (filters?.status?.length) {
    query = query.in("status", filters.status);
  }
  if (filters?.clientId) {
    query = query.eq("client_id", filters.clientId);
  }
  if (filters?.dateFrom) {
    query = query.gte("contract_date", filters.dateFrom);
  }
  if (filters?.dateTo) {
    query = query.lte("contract_date", filters.dateTo);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useDashboardMetrics(filters?: DashboardFilters) {
  const query = useQuery({
    queryKey: ["dashboard-metrics", filters],
    queryFn: () => fetchDashboardContracts(filters),
    staleTime: 30_000,          // considera fresco por 30s
    refetchInterval: 60_000,    // refetch a cada 1 minuto (dados financeiros sensíveis)
    refetchOnWindowFocus: true,
    select: computeMetrics,     // transforma o array em DashboardMetrics
  });

  return {
    metrics: query.data,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}

// ─── Hook de listagem (para o FlatList do dashboard) ─────────────────────────

export function useContractsList(filters?: DashboardFilters) {
  return useQuery({
    queryKey: ["contracts-list", filters],
    queryFn: () => fetchDashboardContracts(filters),
    staleTime: 30_000,
  });
}

// ─── Hook de invalidação (chamar após criar/atualizar contrato) ───────────────

import { useQueryClient } from "@tanstack/react-query";

export function useInvalidateDashboard() {
  const queryClient = useQueryClient();

  return function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
    queryClient.invalidateQueries({ queryKey: ["contracts-list"] });
  };
}

// ─── Realtime (Supabase) ──────────────────────────────────────────────────────
// Usar em conjunto com useDashboardMetrics para atualizações em tempo real.

import { useEffect } from "react";

export function useDashboardRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("dashboard-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "installments",
        },
        () => {
          // Qualquer mudança em parcelas (pagamento, atraso) invalida o cache
          queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
          queryClient.invalidateQueries({ queryKey: ["contracts-list"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "contracts",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
          queryClient.invalidateQueries({ queryKey: ["contracts-list"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
