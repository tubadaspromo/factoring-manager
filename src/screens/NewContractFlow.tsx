/**
 * NewContractFlow
 *
 * Orquestrador do fluxo multi-step de criação de contrato.
 * Gerencia:
 * - Stepper visual com indicador de progresso
 * - Transições animadas entre steps
 * - NewClientDrawer (sub-fluxo) sem perder estado do form principal
 * - Chamada à Edge Function e navegação pós-criação
 */

import React, { useCallback, useEffect } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Animated, {
  FadeInRight,
  FadeOutLeft,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";

import { Colors, Typography, Spacing, Radius, Shadow } from "@/theme";
import {
  useNewContractStore,
  selectCurrentStep,
  selectFormData,
  selectIsDrawerOpen,
  selectSummary,
  selectIsSubmitting,
  useStepValidation,
  type ContractStep,
} from "@/stores/newContractStore";
import { useInvalidateDashboard } from "@/hooks/useDashboardMetrics";
import { supabase } from "@/lib/supabase";

// Steps (importados separadamente para manter este arquivo focado)
import { StepSelectClient }   from "./steps/StepSelectClient";
import { StepContractParams } from "./steps/StepContractParams";
import { StepPaymentTerms }   from "./steps/StepPaymentTerms";
import { StepSummary }        from "./steps/StepSummary";
import { NewClientDrawer }    from "@/components/clients/NewClientDrawer";

// ─── Configuração dos steps ───────────────────────────────────────────────────

const STEPS: { id: ContractStep; label: string }[] = [
  { id: "select_client",   label: "Cliente" },
  { id: "contract_params", label: "Contrato" },
  { id: "payment_terms",   label: "Pagamento" },
  { id: "summary",         label: "Resumo" },
];

// ─── Componente principal ─────────────────────────────────────────────────────

export function NewContractFlow() {
  const currentStep    = useNewContractStore(selectCurrentStep);
  const formData       = useNewContractStore(selectFormData);
  const isDrawerOpen   = useNewContractStore(selectIsDrawerOpen);
  const summary        = useNewContractStore(selectSummary);
  const isSubmitting   = useNewContractStore(selectIsSubmitting);
  const validation     = useStepValidation();

  const { goNext, goPrev, reset, setSubmitting, setSubmitError, setSummary } =
    useNewContractStore();

  const invalidateDashboard = useInvalidateDashboard();

  // Reset ao desmontar
  useEffect(() => {
    return () => reset();
  }, [reset]);

  // ── Mutação: gerar parcelas (preview antes de salvar) ───────────────────────

  const previewMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-installments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            // Não inclui client_id — preview apenas, sem persistir
            client_id:         formData.selectedClient!.id,
            contract_date:     formData.contractDate,
            principal_amount:  parseFloat(formData.principalAmount),
            interest_type:     formData.interestType,
            interest_value:    parseFloat(formData.interestValue),
            late_fee_enabled:  formData.lateFeeEnabled,
            late_fee_daily:    formData.lateFeeEnabled
                                 ? parseFloat(formData.lateFeeDaily)
                                 : undefined,
            payment_type:      formData.paymentType,
            installments_count: formData.paymentType === "installments"
                                 ? formData.installmentsCount
                                 : undefined,
            first_due_date:    formData.firstDueDate,
            // Flag especial para preview (não persiste no banco)
            preview_only: true,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erro ao calcular parcelas");
      }

      return res.json();
    },
    onSuccess: (data) => {
      setSummary({
        installments:   data.installments,
        totalPrincipal: data.summary.total_principal,
        totalInterest:  data.summary.total_interest,
        totalAmount:    data.summary.total_amount,
        warnings:       data.warnings ?? [],
      });
      goNext(); // vai para Summary
    },
    onError: (err: Error) => {
      setSubmitError(err.message);
    },
  });

  // ── Mutação: confirmar e salvar ────────────────────────────────────────────

  const submitMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/generate-installments`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            client_id:          formData.selectedClient!.id,
            contract_date:      formData.contractDate,
            principal_amount:   parseFloat(formData.principalAmount),
            interest_type:      formData.interestType,
            interest_value:     parseFloat(formData.interestValue),
            late_fee_enabled:   formData.lateFeeEnabled,
            late_fee_daily:     formData.lateFeeEnabled
                                  ? parseFloat(formData.lateFeeDaily)
                                  : undefined,
            payment_type:       formData.paymentType,
            installments_count: formData.paymentType === "installments"
                                  ? formData.installmentsCount
                                  : undefined,
            first_due_date:     formData.firstDueDate,
          }),
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Erro ao criar contrato");
      }

      return res.json();
    },
    onSuccess: (data) => {
      invalidateDashboard();
      reset();
      router.replace(`/contracts/${data.contract_id}`);
    },
    onError: (err: Error) => {
      setSubmitting(false);
      setSubmitError(err.message);
    },
  });

  // ── Handlers de step ───────────────────────────────────────────────────────

  const handleNextFromPaymentTerms = useCallback(() => {
    previewMutation.mutate();
  }, [previewMutation]);

  const handleConfirmAndSave = useCallback(() => {
    setSubmitting(true);
    submitMutation.mutate();
  }, [submitMutation, setSubmitting]);

  const canProceed = validation[currentStep];

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <Text style={styles.backIcon}>‹</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Novo Contrato</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Stepper */}
        <StepperIndicator currentStep={currentStep} />

        {/* Conteúdo do step */}
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View
            key={currentStep}
            entering={FadeInRight.duration(200)}
            exiting={FadeOutLeft.duration(150)}
          >
            {currentStep === "select_client"   && <StepSelectClient />}
            {currentStep === "contract_params" && <StepContractParams />}
            {currentStep === "payment_terms"   && <StepPaymentTerms />}
            {currentStep === "summary"         && <StepSummary summary={summary} />}
          </Animated.View>
        </ScrollView>

        {/* Rodapé com CTAs */}
        <FooterActions
          currentStep={currentStep}
          canProceed={canProceed}
          isLoading={previewMutation.isPending || submitMutation.isPending}
          onBack={goPrev}
          onNext={
            currentStep === "payment_terms"
              ? handleNextFromPaymentTerms
              : currentStep === "summary"
              ? handleConfirmAndSave
              : goNext
          }
        />
      </KeyboardAvoidingView>

      {/* Drawer de novo cliente — sobrepõe o formulário sem perder estado */}
      <NewClientDrawer
        isOpen={isDrawerOpen}
        onClose={useNewContractStore.getState().closeNewClientDrawer}
        onClientCreated={useNewContractStore.getState().onClientCreated}
      />
    </SafeAreaView>
  );
}

// ─── Stepper ──────────────────────────────────────────────────────────────────

function StepperIndicator({ currentStep }: { currentStep: ContractStep }) {
  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);

  return (
    <View style={styles.stepper}>
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx;
        const isActive    = idx === currentIdx;

        return (
          <React.Fragment key={step.id}>
            {idx > 0 && (
              <View
                style={[
                  styles.stepConnector,
                  isCompleted && styles.stepConnectorActive,
                ]}
              />
            )}
            <View style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  isActive    && styles.stepDotActive,
                  isCompleted && styles.stepDotCompleted,
                ]}
              >
                {isCompleted ? (
                  <Text style={styles.stepCheckmark}>✓</Text>
                ) : (
                  <Text
                    style={[
                      styles.stepNumber,
                      (isActive || isCompleted) && styles.stepNumberActive,
                    ]}
                  >
                    {idx + 1}
                  </Text>
                )}
              </View>
              <Text
                style={[
                  styles.stepLabel,
                  isActive && styles.stepLabelActive,
                ]}
              >
                {step.label}
              </Text>
            </View>
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

interface FooterActionsProps {
  currentStep: ContractStep;
  canProceed: boolean;
  isLoading: boolean;
  onBack: () => void;
  onNext: () => void;
}

function FooterActions({
  currentStep,
  canProceed,
  isLoading,
  onBack,
  onNext,
}: FooterActionsProps) {
  const isFirstStep = currentStep === "select_client";
  const isLastStep  = currentStep === "summary";

  return (
    <View style={styles.footer}>
      {!isFirstStep && (
        <Pressable style={styles.backBtn} onPress={onBack}>
          <Text style={styles.backBtnText}>Voltar</Text>
        </Pressable>
      )}

      <Pressable
        style={[
          styles.nextBtn,
          isFirstStep && styles.nextBtnFull,
          (!canProceed || isLoading) && styles.nextBtnDisabled,
        ]}
        onPress={onNext}
        disabled={!canProceed || isLoading}
      >
        <Text style={styles.nextBtnText}>
          {isLoading
            ? "Calculando..."
            : isLastStep
            ? "Confirmar e Salvar"
            : "Continuar"}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg.base,
  },
  flex: { flex: 1 },

  // Header
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.screen,
    paddingVertical: Spacing["4"],
    borderBottomWidth: 1,
    borderBottomColor: Colors.separator,
  },
  backButton: { padding: Spacing["2"] },
  backIcon: {
    fontSize: 28,
    color: Colors.text.secondary,
    lineHeight: 28,
  },
  headerTitle: {
    fontFamily: Typography.family.heading,
    fontSize: Typography.size.lg,
    color: Colors.text.primary,
  },
  headerRight: { width: 36 },

  // Stepper
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing["5"],
    paddingHorizontal: Spacing.screen,
    gap: 0,
  },
  stepItem: {
    alignItems: "center",
    gap: Spacing["1"],
  },
  stepConnector: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.bg.overlay,
    marginBottom: Spacing["4"],
    marginHorizontal: Spacing["2"],
  },
  stepConnectorActive: {
    backgroundColor: Colors.brand.default,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: Radius.full,
    backgroundColor: Colors.bg.elevated,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  stepDotActive: {
    borderColor: Colors.brand.default,
    backgroundColor: Colors.brand.muted,
  },
  stepDotCompleted: {
    borderColor: Colors.brand.default,
    backgroundColor: Colors.brand.default,
  },
  stepNumber: {
    fontFamily: Typography.family.bodySemiBold,
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
  },
  stepNumberActive: {
    color: Colors.brand.default,
  },
  stepCheckmark: {
    fontSize: Typography.size.xs,
    color: Colors.brand.contrast,
    fontWeight: "700",
  },
  stepLabel: {
    fontFamily: Typography.family.body,
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
  },
  stepLabelActive: {
    color: Colors.brand.default,
    fontFamily: Typography.family.bodyMedium,
  },

  // Scroll
  scrollContent: {
    padding: Spacing.screen,
    paddingBottom: Spacing["10"],
  },

  // Footer
  footer: {
    flexDirection: "row",
    gap: Spacing["3"],
    padding: Spacing.screen,
    paddingBottom: Spacing["6"],
    borderTopWidth: 1,
    borderTopColor: Colors.separator,
    backgroundColor: Colors.bg.base,
  },
  backBtn: {
    flex: 1,
    height: 52,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  backBtnText: {
    fontFamily: Typography.family.bodyMedium,
    fontSize: Typography.size.md,
    color: Colors.text.secondary,
  },
  nextBtn: {
    flex: 2,
    height: 52,
    borderRadius: Radius.lg,
    backgroundColor: Colors.brand.default,
    justifyContent: "center",
    alignItems: "center",
    ...Shadow.brand,
  },
  nextBtnFull: { flex: 1 },
  nextBtnDisabled: {
    backgroundColor: Colors.bg.elevated,
    ...Shadow.sm,
  },
  nextBtnText: {
    fontFamily: Typography.family.bodySemiBold,
    fontSize: Typography.size.md,
    color: Colors.brand.contrast,
  },
});
