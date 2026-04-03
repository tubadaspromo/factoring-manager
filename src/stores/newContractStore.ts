/**
 * newContractStore — Zustand
 *
 * Estado global para o fluxo multi-step de criação de contrato.
 *
 * Responsabilidade:
 * - Persistir dados entre steps sem perda ao abrir sub-fluxo de novo cliente
 * - Gerenciar qual step está ativo
 * - Armazenar preview de parcelas calculadas (antes de persistir)
 * - Reset limpo após conclusão ou cancelamento
 *
 * Fluxo de steps:
 *   STEP 1: select_client   → selecionar cliente existente ou abrir NewClientDrawer
 *   STEP 2: contract_params → data, valor, juros, mora
 *   STEP 3: payment_terms   → à vista ou a prazo (parcelas + 1ª data)
 *   STEP 4: summary         → preview de parcelas + confirmação
 */

import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type {
  InterestType,
  PaymentType,
  InstallmentInsertPayload,
  ClientRow,
} from "@/types/database.types";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ContractStep =
  | "select_client"
  | "contract_params"
  | "payment_terms"
  | "summary";

export interface ContractFormData {
  // Step 1
  selectedClient: ClientRow | null;

  // Step 2
  contractDate: string;           // ISO: "2025-01-15"
  principalAmount: string;        // string para input controlado
  interestType: InterestType;
  interestValue: string;
  lateFeeEnabled: boolean;
  lateFeeDaily: string;

  // Step 3
  paymentType: PaymentType;
  installmentsCount: number;
  firstDueDate: string;
}

export interface ContractSummary {
  installments: InstallmentInsertPayload[];
  totalPrincipal: number;
  totalInterest: number;
  totalAmount: number;
  warnings: string[];
}

interface NewContractState {
  // Navegação
  currentStep: ContractStep;
  isNewClientDrawerOpen: boolean;

  // Dados do formulário
  formData: ContractFormData;

  // Preview calculado (Step 4)
  summary: ContractSummary | null;

  // Status de submissão
  isSubmitting: boolean;
  submitError: string | null;

  // Ações de navegação
  goToStep: (step: ContractStep) => void;
  goNext: () => void;
  goPrev: () => void;

  // Ações do drawer de novo cliente
  openNewClientDrawer: () => void;
  closeNewClientDrawer: () => void;
  onClientCreated: (client: ClientRow) => void; // fecha drawer e pré-seleciona

  // Ações de dados
  setFormField: <K extends keyof ContractFormData>(
    field: K,
    value: ContractFormData[K]
  ) => void;
  setSummary: (summary: ContractSummary) => void;
  setSubmitting: (submitting: boolean) => void;
  setSubmitError: (error: string | null) => void;

  // Reset
  reset: () => void;
}

// ─── Estado inicial ───────────────────────────────────────────────────────────

const today = new Date().toISOString().split("T")[0];
const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
  .toISOString()
  .split("T")[0];

const INITIAL_FORM: ContractFormData = {
  selectedClient:   null,
  contractDate:     today,
  principalAmount:  "",
  interestType:     "percent",
  interestValue:    "",
  lateFeeEnabled:   false,
  lateFeeDaily:     "",
  paymentType:      "installments",
  installmentsCount: 3,
  firstDueDate:     nextMonth,
};

const STEP_ORDER: ContractStep[] = [
  "select_client",
  "contract_params",
  "payment_terms",
  "summary",
];

// ─── Store ────────────────────────────────────────────────────────────────────

export const useNewContractStore = create<NewContractState>()(
  devtools(
    (set, get) => ({
      currentStep: "select_client",
      isNewClientDrawerOpen: false,
      formData: INITIAL_FORM,
      summary: null,
      isSubmitting: false,
      submitError: null,

      // ── Navegação ──────────────────────────────────────────────────────────

      goToStep: (step) => set({ currentStep: step }),

      goNext: () => {
        const { currentStep } = get();
        const idx = STEP_ORDER.indexOf(currentStep);
        const next = STEP_ORDER[idx + 1];
        if (next) set({ currentStep: next });
      },

      goPrev: () => {
        const { currentStep } = get();
        const idx = STEP_ORDER.indexOf(currentStep);
        const prev = STEP_ORDER[idx - 1];
        if (prev) set({ currentStep: prev });
      },

      // ── Drawer de novo cliente ─────────────────────────────────────────────
      // Abre um drawer SEM navegar nem perder o estado do formulário principal.

      openNewClientDrawer: () =>
        set({ isNewClientDrawerOpen: true }),

      closeNewClientDrawer: () =>
        set({ isNewClientDrawerOpen: false }),

      onClientCreated: (client) =>
        set((state) => ({
          isNewClientDrawerOpen: false,
          formData: { ...state.formData, selectedClient: client },
        })),

      // ── Atualização de campos ─────────────────────────────────────────────

      setFormField: (field, value) =>
        set((state) => ({
          formData: { ...state.formData, [field]: value },
        })),

      setSummary: (summary) => set({ summary }),

      setSubmitting: (isSubmitting) => set({ isSubmitting }),

      setSubmitError: (submitError) => set({ submitError }),

      // ── Reset ──────────────────────────────────────────────────────────────

      reset: () =>
        set({
          currentStep: "select_client",
          isNewClientDrawerOpen: false,
          formData: INITIAL_FORM,
          summary: null,
          isSubmitting: false,
          submitError: null,
        }),
    }),
    { name: "new-contract-store" }
  )
);

// ─── Selectors (evitam re-renders desnecessários) ─────────────────────────────

export const selectCurrentStep       = (s: NewContractState) => s.currentStep;
export const selectFormData          = (s: NewContractState) => s.formData;
export const selectSelectedClient    = (s: NewContractState) => s.formData.selectedClient;
export const selectIsDrawerOpen      = (s: NewContractState) => s.isNewClientDrawerOpen;
export const selectSummary           = (s: NewContractState) => s.summary;
export const selectIsSubmitting      = (s: NewContractState) => s.isSubmitting;

// ─── Hook de validação por step ───────────────────────────────────────────────

import { useMemo } from "react";

export function useStepValidation() {
  const formData = useNewContractStore(selectFormData);

  return useMemo(() => ({
    select_client: !!formData.selectedClient,

    contract_params:
      !!formData.principalAmount &&
      parseFloat(formData.principalAmount) > 0 &&
      !!formData.interestValue &&
      parseFloat(formData.interestValue) >= 0 &&
      (!formData.lateFeeEnabled ||
        (!!formData.lateFeeDaily && parseFloat(formData.lateFeeDaily) > 0)),

    payment_terms:
      !!formData.firstDueDate &&
      (formData.paymentType === "lump_sum" ||
        formData.installmentsCount >= 2),

    summary: true, // sempre válido se chegou aqui
  }), [formData]);
}
