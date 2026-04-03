/**
 * MetricCard
 *
 * Card de métrica para o Dashboard.
 * Variantes: "hero" (destaque principal) e "compact" (métricas secundárias).
 */

import React from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
  ActivityIndicator,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Colors, Typography, Spacing, Radius, Shadow, formatCurrency, formatShortCurrency } from "@/theme";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: number;
  variant?: "hero" | "compact";
  format?: "currency" | "short" | "integer";
  trend?: {
    value: number;    // percentual: +5.2 ou -3.1
    period: string;   // "vs. mês anterior"
  };
  subtitle?: string;
  onPress?: () => void;
  isLoading?: boolean;
  style?: ViewStyle;
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function MetricCard({
  label,
  value,
  variant = "compact",
  format = "currency",
  trend,
  subtitle,
  onPress,
  isLoading = false,
  style,
}: MetricCardProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  function handlePressIn() {
    scale.value = withSpring(0.97, { damping: 20, stiffness: 400 });
  }
  function handlePressOut() {
    scale.value = withSpring(1, { damping: 20, stiffness: 400 });
  }

  function formatValue(v: number): string {
    switch (format) {
      case "short":   return formatShortCurrency(v);
      case "integer": return v.toLocaleString("pt-BR");
      default:        return formatCurrency(v);
    }
  }

  const isPositiveTrend = (trend?.value ?? 0) >= 0;

  if (variant === "hero") {
    return (
      <Animated.View style={[animatedStyle, style]}>
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={onPress}
          style={styles.heroCard}
        >
          {/* Glow decorativo */}
          <View style={styles.heroGlow} pointerEvents="none" />

          <Text style={styles.heroLabel}>{label}</Text>

          {isLoading ? (
            <ActivityIndicator color={Colors.brand.default} size="large" style={styles.loader} />
          ) : (
            <Text style={styles.heroValue} numberOfLines={1} adjustsFontSizeToFit>
              {formatValue(value)}
            </Text>
          )}

          {trend && (
            <View style={styles.trendRow}>
              <Text style={[
                styles.trendValue,
                { color: isPositiveTrend ? Colors.status.active.text : Colors.status.overdue.text }
              ]}>
                {isPositiveTrend ? "▲" : "▼"} {Math.abs(trend.value).toFixed(1)}%
              </Text>
              <Text style={styles.trendPeriod}>{trend.period}</Text>
            </View>
          )}

          {subtitle && (
            <Text style={styles.heroSubtitle}>{subtitle}</Text>
          )}
        </Pressable>
      </Animated.View>
    );
  }

  // Variant: compact
  return (
    <Animated.View style={[animatedStyle, style]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={onPress}
        style={styles.compactCard}
      >
        <Text style={styles.compactLabel}>{label}</Text>

        {isLoading ? (
          <ActivityIndicator color={Colors.brand.default} size="small" style={styles.loader} />
        ) : (
          <Text style={styles.compactValue} numberOfLines={1} adjustsFontSizeToFit>
            {formatValue(value)}
          </Text>
        )}

        {trend && (
          <Text style={[
            styles.compactTrend,
            { color: isPositiveTrend ? Colors.status.active.text : Colors.status.overdue.text }
          ]}>
            {isPositiveTrend ? "+" : ""}{trend.value.toFixed(1)}%
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Hero card
  heroCard: {
    backgroundColor: Colors.bg.surface,
    borderRadius: Radius.xl,
    padding: Spacing["6"],
    borderWidth: 1,
    borderColor: Colors.brand.muted,
    overflow: "hidden",
    ...Shadow.brand,
  },
  heroGlow: {
    position: "absolute",
    top: -60,
    right: -60,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: Colors.brand.muted,
    opacity: 0.6,
  },
  heroLabel: {
    fontFamily: Typography.family.bodyMedium,
    fontSize: Typography.size.sm,
    color: Colors.text.secondary,
    letterSpacing: Typography.letterSpacing.wider,
    textTransform: "uppercase",
    marginBottom: Spacing["3"],
  },
  heroValue: {
    fontFamily: Typography.family.mono,
    fontSize: Typography.size["3xl"],
    color: Colors.brand.default,
    letterSpacing: Typography.letterSpacing.tight,
    marginBottom: Spacing["3"],
  },
  heroSubtitle: {
    fontFamily: Typography.family.body,
    fontSize: Typography.size.sm,
    color: Colors.text.tertiary,
    marginTop: Spacing["2"],
  },

  // Trend row
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing["2"],
  },
  trendValue: {
    fontFamily: Typography.family.bodySemiBold,
    fontSize: Typography.size.sm,
  },
  trendPeriod: {
    fontFamily: Typography.family.body,
    fontSize: Typography.size.sm,
    color: Colors.text.tertiary,
  },

  // Compact card
  compactCard: {
    backgroundColor: Colors.bg.surface,
    borderRadius: Radius.lg,
    padding: Spacing["4"],
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  compactLabel: {
    fontFamily: Typography.family.body,
    fontSize: Typography.size.xs,
    color: Colors.text.secondary,
    letterSpacing: Typography.letterSpacing.wider,
    textTransform: "uppercase",
    marginBottom: Spacing["2"],
  },
  compactValue: {
    fontFamily: Typography.family.bodySemiBold,
    fontSize: Typography.size.lg,
    color: Colors.text.primary,
    letterSpacing: Typography.letterSpacing.tight,
  },
  compactTrend: {
    fontFamily: Typography.family.bodyMedium,
    fontSize: Typography.size.xs,
    marginTop: Spacing["1"],
  },

  // Loading
  loader: {
    marginVertical: Spacing["2"],
  },
});
