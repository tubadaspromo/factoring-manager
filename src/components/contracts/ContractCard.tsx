/**
 * ContractCard
 *
 * Card de contrato para listagens. Padrão de design com:
 * - Barra vertical colorida (indicador de status)
 * - Informações hierarquizadas (cliente → valor → progresso)
 * - Avatar com inicial do cliente
 * - Progress bar de parcelas pagas
 * - Suporte a Pressable com feedback háptico
 */

import React, { useCallback } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { StatusBadge, StatusBar } from "@/components/ui/StatusBadge";
import { Colors, Typography, Spacing, Radius, Shadow, formatCurrency } from "@/theme";
import type { DashboardContractRow } from "@/types/database.types";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ContractCardProps {
  contract: DashboardContractRow;
  onPress: (contractId: string) => void;
  style?: ViewStyle;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
  });
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function ContractCard({ contract, onPress, style }: ContractCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = useCallback(() => {
    scale.value = withSpring(0.98, { damping: 20, stiffness: 400 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [scale]);

  const handlePressOut = useCallback(() => {
    scale.value = withSpring(1, { damping: 20, stiffness: 400 });
  }, [scale]);

  const handlePress = useCallback(() => {
    onPress(contract.id);
  }, [contract.id, onPress]);

  const progressPercent =
    contract.total_installments > 0
      ? (contract.paid_installments / contract.total_installments) * 100
      : 0;

  const isOverdueInstallments = contract.overdue_installments > 0;

  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel={`Contrato de ${contract.client_name}, ${formatCurrency(contract.total_amount ?? 0)}`}
      >
        {/* Barra de status lateral */}
        <StatusBar status={contract.status} />

        {/* Conteúdo principal */}
        <View style={styles.content}>
          {/* Linha 1: Avatar + Nome + Badge */}
          <View style={styles.headerRow}>
            <ClientAvatar name={contract.client_name} />

            <View style={styles.clientInfo}>
              <Text style={styles.clientName} numberOfLines={1}>
                {contract.client_nickname ?? contract.client_name}
              </Text>
              {contract.client_nickname && (
                <Text style={styles.clientFullName} numberOfLines={1}>
                  {contract.client_name}
                </Text>
              )}
            </View>

            <StatusBadge status={contract.status} variant="pill" size="sm" />
          </View>

          {/* Linha 2: Valor principal + Saldo devedor */}
          <View style={styles.amountRow}>
            <View>
              <Text style={styles.amountLabel}>Valor total</Text>
              <Text style={styles.amountValue}>
                {formatCurrency(contract.total_amount ?? 0)}
              </Text>
            </View>
            <View style={styles.outstandingBlock}>
              <Text style={styles.amountLabel}>A receber</Text>
              <Text style={[
                styles.outstandingValue,
                isOverdueInstallments && styles.outstandingOverdue,
              ]}>
                {formatCurrency(contract.outstanding_balance)}
              </Text>
            </View>
          </View>

          {/* Linha 3: Progress bar de parcelas */}
          {contract.payment_type === "installments" && (
            <View style={styles.progressSection}>
              <View style={styles.progressBar}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${progressPercent}%` as any },
                    isOverdueInstallments && styles.progressFillOverdue,
                  ]}
                />
              </View>
              <Text style={styles.progressLabel}>
                {contract.paid_installments}/{contract.total_installments} parcelas
                {isOverdueInstallments && (
                  <Text style={styles.overdueLabel}>
                    {" "}· {contract.overdue_installments} atrasada{contract.overdue_installments > 1 ? "s" : ""}
                  </Text>
                )}
              </Text>
            </View>
          )}

          {/* Linha 4: Data de vencimento */}
          {contract.next_due_date && contract.status === "active" && (
            <View style={styles.dueDateRow}>
              <Text style={styles.dueDateIcon}>📅</Text>
              <Text style={styles.dueDateText}>
                Próximo venc.: {formatDate(contract.next_due_date)}
              </Text>
            </View>
          )}
        </View>

        {/* Chevron */}
        <Text style={styles.chevron}>›</Text>
      </Pressable>
    </Animated.View>
  );
}

// ─── Avatar do cliente ────────────────────────────────────────────────────────

function ClientAvatar({ name }: { name: string }) {
  const initials = getInitials(name);
  // Cor determinística baseada no nome (evita flashs de cor aleatória)
  const hue = name.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  const bgColor = `hsla(${hue}, 45%, 30%, 1)`;
  const textColor = `hsla(${hue}, 75%, 80%, 1)`;

  return (
    <View style={[styles.avatar, { backgroundColor: bgColor }]}>
      <Text style={[styles.avatarText, { color: textColor }]}>{initials}</Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: Colors.bg.surface,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
    gap: Spacing["3"],
    ...Shadow.sm,
  },

  content: {
    flex: 1,
    padding: Spacing["4"],
    paddingLeft: Spacing["3"],
    gap: Spacing["3"],
  },

  // Header
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing["3"],
  },
  clientInfo: {
    flex: 1,
  },
  clientName: {
    fontFamily: Typography.family.bodySemiBold,
    fontSize: Typography.size.md,
    color: Colors.text.primary,
  },
  clientFullName: {
    fontFamily: Typography.family.body,
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
    marginTop: 2,
  },

  // Avatar
  avatar: {
    width: 38,
    height: 38,
    borderRadius: Radius.full,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontFamily: Typography.family.bodyBold,
    fontSize: Typography.size.sm,
  },

  // Valores
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  amountLabel: {
    fontFamily: Typography.family.body,
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
    letterSpacing: Typography.letterSpacing.wide,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  amountValue: {
    fontFamily: Typography.family.mono,
    fontSize: Typography.size.lg,
    color: Colors.text.primary,
    letterSpacing: Typography.letterSpacing.tight,
  },
  outstandingBlock: {
    alignItems: "flex-end",
  },
  outstandingValue: {
    fontFamily: Typography.family.mono,
    fontSize: Typography.size.md,
    color: Colors.brand.default,
    letterSpacing: Typography.letterSpacing.tight,
  },
  outstandingOverdue: {
    color: Colors.status.overdue.text,
  },

  // Progress
  progressSection: {
    gap: Spacing["1"] + 2,
  },
  progressBar: {
    height: 4,
    backgroundColor: Colors.bg.overlay,
    borderRadius: Radius.full,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: Colors.brand.default,
    borderRadius: Radius.full,
  },
  progressFillOverdue: {
    backgroundColor: Colors.status.overdue.text,
  },
  progressLabel: {
    fontFamily: Typography.family.body,
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
  },
  overdueLabel: {
    color: Colors.status.overdue.text,
  },

  // Due date
  dueDateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing["1"],
  },
  dueDateIcon: {
    fontSize: Typography.size.xs,
  },
  dueDateText: {
    fontFamily: Typography.family.body,
    fontSize: Typography.size.xs,
    color: Colors.text.tertiary,
  },

  // Chevron
  chevron: {
    alignSelf: "center",
    paddingRight: Spacing["4"],
    fontSize: 22,
    color: Colors.text.tertiary,
    fontWeight: "300",
  },
});
