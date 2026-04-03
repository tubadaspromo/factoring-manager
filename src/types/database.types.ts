/**
 * Tipos TypeScript do schema do banco de dados.
 *
 * Em produção, gere este arquivo automaticamente com:
 *   supabase gen types typescript --project-id <id> > src/types/database.types.ts
 *
 * Este arquivo é a fonte de verdade para tipagem do Supabase client.
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export type InterestType = "percent" | "fixed";
export type PaymentType = "lump_sum" | "installments";
export type ContractStatus = "active" | "settled" | "overdue" | "cancelled";
export type InstallmentStatus = "pending" | "paid" | "overdue" | "partial";

// ─── Tabelas (Row = leitura, Insert = escrita, Update = atualização) ──────────

export interface Database {
  public: {
    Tables: {
      clients: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          nickname: string | null;
          phone: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          nickname?: string | null;
          phone?: string | null;
          created_at?: string;
          updated_at?: string;
          deleted_at?: string | null;
        };
        Update: {
          name?: string;
          nickname?: string | null;
          phone?: string | null;
          updated_at?: string;
          deleted_at?: string | null;
        };
      };

      client_documents: {
        Row: {
          id: string;
          client_id: string;
          label: string;
          storage_path: string;
          mime_type: string | null;
          size_bytes: number | null;
          uploaded_at: string;
        };
        Insert: {
          id?: string;
          client_id: string;
          label?: string;
          storage_path: string;
          mime_type?: string | null;
          size_bytes?: number | null;
          uploaded_at?: string;
        };
        Update: {
          label?: string;
        };
      };

      contracts: {
        Row: {
          id: string;
          user_id: string;
          client_id: string;
          contract_date: string;
          principal_amount: number;
          interest_type: InterestType;
          interest_value: number;
          late_fee_enabled: boolean;
          late_fee_daily: number | null;
          payment_type: PaymentType;
          installments_count: number | null;
          first_due_date: string;
          total_amount: number | null;
          total_interest: number | null;
          status: ContractStatus;
          notes: string | null;
          created_at: string;
          updated_at: string;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          client_id: string;
          contract_date?: string;
          principal_amount: number;
          interest_type: InterestType;
          interest_value: number;
          late_fee_enabled?: boolean;
          late_fee_daily?: number | null;
          payment_type: PaymentType;
          installments_count?: number | null;
          first_due_date: string;
          total_amount?: number | null;
          total_interest?: number | null;
          status?: ContractStatus;
          notes?: string | null;
        };
        Update: {
          status?: ContractStatus;
          notes?: string | null;
          deleted_at?: string | null;
        };
      };

      installments: {
        Row: {
          id: string;
          contract_id: string;
          installment_no: number;
          due_date: string;
          principal: number;
          interest: number;
          total_amount: number;         // coluna gerada
          status: InstallmentStatus;
          paid_at: string | null;
          paid_amount: number | null;
          late_fee_applied: number;
        };
        Insert: {
          id?: string;
          contract_id: string;
          installment_no: number;
          due_date: string;
          principal: number;
          interest?: number;
          status?: InstallmentStatus;
          paid_at?: string | null;
          paid_amount?: number | null;
          late_fee_applied?: number;
        };
        Update: {
          status?: InstallmentStatus;
          paid_at?: string | null;
          paid_amount?: number | null;
          late_fee_applied?: number;
        };
      };

      payments: {
        Row: {
          id: string;
          installment_id: string;
          paid_at: string;
          amount: number;
          late_fee: number;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          installment_id: string;
          paid_at?: string;
          amount: number;
          late_fee?: number;
          notes?: string | null;
        };
        Update: never; // payments são imutáveis
      };
    };

    Views: {
      dashboard_contracts: {
        Row: {
          id: string;
          user_id: string;
          contract_date: string;
          status: ContractStatus;
          principal_amount: number;
          total_amount: number | null;
          total_interest: number | null;
          first_due_date: string;
          payment_type: PaymentType;
          installments_count: number | null;
          client_name: string;
          client_nickname: string | null;
          client_phone: string | null;
          total_installments: number;
          paid_installments: number;
          overdue_installments: number;
          outstanding_balance: number;
          next_due_date: string | null;
        };
      };
    };

    Functions: {
      create_contract_with_installments: {
        Args: {
          p_user_id: string;
          p_client_id: string;
          p_contract_date: string;
          p_principal_amount: number;
          p_interest_type: InterestType;
          p_interest_value: number;
          p_late_fee_enabled: boolean;
          p_late_fee_daily: number | null;
          p_payment_type: PaymentType;
          p_installments_count: number | null;
          p_first_due_date: string;
          p_total_amount: number;
          p_total_interest: number;
          p_notes: string | null;
          p_installments: InstallmentInsertPayload[];
        };
        Returns: string; // contract UUID
      };
      register_installment_payment: {
        Args: {
          p_installment_id: string;
          p_paid_amount: number;
          p_late_fee: number;
          p_payment_date: string;
          p_is_fully_paid: boolean;
          p_notes: string | null;
        };
        Returns: void;
      };
      mark_overdue_installments: {
        Args: Record<never, never>;
        Returns: number;
      };
    };
  };
}

// ─── Helpers de payload ───────────────────────────────────────────────────────

export interface InstallmentInsertPayload {
  installment_no: number;
  due_date: string;
  principal: number;
  interest: number;
  total_amount: number;
}

// ─── Tipos derivados (para uso nos componentes) ───────────────────────────────

export type ClientRow = Database["public"]["Tables"]["clients"]["Row"];
export type ContractRow = Database["public"]["Tables"]["contracts"]["Row"];
export type InstallmentRow = Database["public"]["Tables"]["installments"]["Row"];
export type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
export type DashboardContractRow = Database["public"]["Views"]["dashboard_contracts"]["Row"];

/** Contrato com cliente embutido (join comum) */
export type ContractWithClient = ContractRow & {
  clients: Pick<ClientRow, "name" | "nickname" | "phone">;
};

/** Contrato completo com parcelas (página de detalhe) */
export type ContractDetail = ContractWithClient & {
  installments: InstallmentRow[];
};
