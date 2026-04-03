/**
 * StatusBadge
 *
 * Badge visual para status de contratos e parcelas.
 * Duas variantes: "pill" (texto + background) e "dot" (ponto + texto inline).
 */

import React from "react";
import { StyleSheet, Text, View, ViewStyle } from "react-native";
import { Colors, Typography, Radius, Spacing } from "@/theme";
import type { ContractStatus, InstallmentStatus } from "@/types/database.types";

// ─── Tipos ────────────────────────────────────────────────────────────────────

type AnyStatus = ContractStatus | InstallmentStatus;

interface StatusBadgeProps {
  status: AnyStatus;
  variant?: "pill" | "dot";
  size?: "sm" | "md";
  style?: ViewStyle;
}

// ─── Mapeamento de labels ─────────────────────────────────────────────────────

const STATUS_LABEL: Record<AnyStatus, string> = {
  active:    "Em Aberto",
  overdue:   "Atrasado",
  settled:   "Concluído",
  cancelled: "Cancelado",
  pending:   "Pendente",
  paid:      "Pago",
  partial:   "Parcial",
};

// ─── Mapeamento de cores ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<AnyStatus, { text: string; bg: string }> = {
  active:    { text: Colors.status.active.text,    bg: Colors.status.active.bg },
  overdue:   { text: Colors.status.overdue.text,   bg: Colors.status.overdue.bg },
  settled:   { text: Colors.status.settled.text,   bg: Colors.status.settled.bg },
  cancelled: { text: Colors.status.cancelled.text, bg: Colors.status.cancelled.bg },
  pending:   { text: Colors.status.pending.text,   bg: Colors.status.pending.bg },
  paid:      { text: Colors.status.active.text,    bg: Colors.status.active.bg },
  partial:   { text: Colors.status.pending.text,   bg: Colors.status.pending.bg },
};

// ─── Componente ───────────────────────────────────────────────────────────────

export function StatusBadge({
  status,
  variant = "pill",
  size = "md",
  style,
}: StatusBadgeProps) {
  const colors = STATUS_COLORS[status];
  const label = STATUS_LABEL[status];

  if (variant === "dot") {
    return (
      <View style={[styles.dotContainer, style]}>
        <View style={[styles.dot, { backgroundColor: colors.text }]} />
        <Text
          style={[
            styles.dotText,
            size === "sm" && styles.textSm,
            { color: colors.text },
          ]}
        >
          {label}
        </Text>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.pill,
        size === "sm" && styles.pillSm,
        { backgroundColor: colors.bg },
        style,
      ]}
    >
      <Text
        style={[
          styles.pillText,
          size === "sm" && styles.textSm,
          { color: colors.text },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── Barra lateral de status (usada nos cards de listagem) ────────────────────

interface StatusBarProps {
  status: AnyStatus;
}

export function StatusBar({ status }: StatusBarProps) {
  const color = Colors.status[
    status as keyof typeof Colors.status
  ]?.bar ?? Colors.status.settled.bar;

  return <View style={[styles.statusBar, { backgroundColor: color }]} />;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Pill
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: Spacing["3"],
    paddingVertical: Spacing["1"] + 2,
    borderRadius: Radius.full,
  },
  pillSm: {
    paddingHorizontal: Spacing["2"],
    paddingVertical: Spacing["1"],
  },
  pillText: {
    fontFamily: Typography.family.bodySemiBold,
    fontSize: Typography.size.sm,
    letterSpacing: Typography.letterSpacing.wide,
  },

  // Dot
  dotContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing["1"] + 2,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: Radius.full,
  },
  dotText: {
    fontFamily: Typography.family.bodyMedium,
    fontSize: Typography.size.base,
    color: Colors.text.secondary,
  },

  // Size modifier
  textSm: {
    fontSize: Typography.size.xs,
  },

  // Status bar (barra vertical nos cards)
  statusBar: {
    width: 3,
    borderRadius: Radius.full,
    alignSelf: "stretch",
  },
});
