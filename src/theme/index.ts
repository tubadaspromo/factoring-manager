/**
 * Design System — Loan Manager
 *
 * Paleta Dark Mode inspirada em fintechs de alto padrão (Nubank, Stark, Inter).
 * Tipografia: Inter (corpo) + Syne (headings) — ambas no Google Fonts / Expo Google Fonts.
 */

// ─── CORES ────────────────────────────────────────────────────────────────────

export const Colors = {
  // Backgrounds (camadas, do mais escuro para o mais claro)
  bg: {
    base:    "#0D0F14",   // fundo raiz — quase preto azulado
    surface: "#161A23",   // cards, modais, drawers
    elevated:"#1E2330",   // inputs, itens de lista
    overlay: "#252B3B",   // hover states, separadores
  },

  // Marca principal — verde-esmeralda financeiro
  brand: {
    default:  "#00D4AA",   // primário: CTAs, highlights
    muted:    "#00D4AA26", // 15% opacity — backgrounds de badge
    dark:     "#009E7E",   // pressed state
    contrast: "#003D30",   // texto sobre fundo brand
  },

  // Status semânticos
  status: {
    active: {
      text: "#00D4AA",
      bg:   "#00D4AA1A",
      bar:  "#00D4AA",
    },
    overdue: {
      text: "#FF5C5C",
      bg:   "#FF5C5C1A",
      bar:  "#FF5C5C",
    },
    settled: {
      text: "#A3A8B8",
      bg:   "#A3A8B81A",
      bar:  "#A3A8B8",
    },
    cancelled: {
      text: "#636878",
      bg:   "#6368781A",
      bar:  "#636878",
    },
    pending: {
      text: "#FFB547",
      bg:   "#FFB5471A",
      bar:  "#FFB547",
    },
  },

  // Texto
  text: {
    primary:   "#F0F2F8",  // headings, valores monetários
    secondary: "#8B91A7",  // labels, subtítulos
    tertiary:  "#505668",  // placeholders, desabilitados
    inverse:   "#0D0F14",  // texto sobre fundo claro
  },

  // Utilitários
  border:    "#252B3B",
  separator: "#1E2330",
  white:     "#FFFFFF",
  black:     "#000000",
  transparent: "transparent",
} as const;

// ─── TIPOGRAFIA ───────────────────────────────────────────────────────────────

export const Typography = {
  // Famílias
  family: {
    heading: "Syne_700Bold",    // @expo-google-fonts/syne
    body:    "Inter_400Regular", // @expo-google-fonts/inter
    bodyMedium: "Inter_500Medium",
    bodySemiBold: "Inter_600SemiBold",
    bodyBold: "Inter_700Bold",
    mono:    "SpaceMono_400Regular", // valores monetários
  },

  // Escala tipográfica (em px / dp)
  size: {
    xs:   10,
    sm:   12,
    base: 14,
    md:   16,
    lg:   18,
    xl:   22,
    "2xl": 28,
    "3xl": 36,
    "4xl": 48,
  },

  // Alturas de linha
  lineHeight: {
    tight:  1.2,
    normal: 1.5,
    loose:  1.75,
  },

  // Espaçamento de letras
  letterSpacing: {
    tight:  -0.5,
    normal: 0,
    wide:   0.5,
    wider:  1.5,  // para labels em caps
  },
} as const;

// ─── ESPAÇAMENTO ──────────────────────────────────────────────────────────────

export const Spacing = {
  "0":    0,
  "1":    4,
  "2":    8,
  "3":    12,
  "4":    16,
  "5":    20,
  "6":    24,
  "8":    32,
  "10":   40,
  "12":   48,
  "16":   64,
  "screen": 20, // padding horizontal padrão de tela
} as const;

// ─── BORDAS ───────────────────────────────────────────────────────────────────

export const Radius = {
  sm:   6,
  md:   10,
  lg:   14,
  xl:   20,
  full: 9999,
} as const;

// ─── SOMBRAS ──────────────────────────────────────────────────────────────────

export const Shadow = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  brand: {
    shadowColor: "#00D4AA",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
} as const;

// ─── ANIMAÇÕES ────────────────────────────────────────────────────────────────

export const Animation = {
  duration: {
    fast:   150,
    normal: 250,
    slow:   400,
  },
  spring: {
    damping: 20,
    stiffness: 300,
  },
} as const;

// ─── FORMATAÇÃO DE MOEDA ──────────────────────────────────────────────────────

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(value);
}

export function formatShortCurrency(value: number): string {
  if (value >= 1_000_000) {
    return `R$ ${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `R$ ${(value / 1_000).toFixed(1)}k`;
  }
  return formatCurrency(value);
}
