/**
 * Design Tokens - Unified styling system for Nizamia App-2A
 * Controls spacing, typography, colors, buttons, and responsive breakpoints
 * Ensures consistency across all pages and components
 */

export const designTokens = {
  // ===== SPACING SCALE =====
  spacing: {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    xxl: '32px',
    xxxl: '48px',
  },

  // ===== TYPOGRAPHY =====
  typography: {
    pageTitle: {
      size: '28px',
      weight: 700,
      lineHeight: 1.2,
      letterSpacing: '-0.5px',
    },
    sectionTitle: {
      size: '20px',
      weight: 700,
      lineHeight: 1.3,
      letterSpacing: '-0.3px',
    },
    subtitle: {
      size: '16px',
      weight: 600,
      lineHeight: 1.4,
      letterSpacing: '-0.2px',
    },
    bodyLarge: {
      size: '14px',
      weight: 400,
      lineHeight: 1.5,
      letterSpacing: '-0.1px',
    },
    body: {
      size: '13px',
      weight: 400,
      lineHeight: 1.5,
      letterSpacing: '-0.1px',
    },
    bodySmall: {
      size: '12px',
      weight: 400,
      lineHeight: 1.5,
      letterSpacing: '0px',
    },
    label: {
      size: '11px',
      weight: 500,
      lineHeight: 1.4,
      letterSpacing: '0.1px',
    },
    labelSmall: {
      size: '10px',
      weight: 600,
      lineHeight: 1.4,
      letterSpacing: '0.2px',
    },
    mono: {
      size: '12px',
      weight: 500,
      lineHeight: 1.4,
      fontFamily: "'Geist Mono', 'SF Mono', monospace",
    },
  },

  // ===== COLORS =====
  colors: {
    // Text
    text: '#0d0d0d',
    textMid: '#555',
    textLight: '#999',
    textLighter: '#bbb',
    textInverse: '#fff',

    // Backgrounds
    bg: '#f7f7f5',
    bgHover: '#f0f0ee',
    bgInput: '#fff',
    bgCard: '#fff',
    bgOverlay: 'rgba(0, 0, 0, 0.5)',

    // Borders
    border: '#e8e8e6',
    borderDark: '#d0d0ce',
    borderLight: '#f0f0ee',

    // Semantic
    accent: '#2383e2',
    accentHover: '#1a5fa0',
    accentLight: '#eff6ff',
    accentLighter: '#dbeafe',

    // Status
    status: {
      active: '#10b981',
      activeBg: '#eff6ff',
      activeBorder: '#bfdbfe',
      draft: '#f59e0b',
      draftBg: '#f5f5f3',
      draftBorder: '#e0e0de',
      pending: '#f97316',
      pendingBg: '#fef3c7',
      pendingBorder: '#fde68a',
      shipped: '#0ea5e9',
      shippedBg: '#f0fdf4',
      shippedBorder: '#bbf7d0',
      completed: '#10b981',
      completedBg: '#f0fdf4',
      completedBorder: '#bbf7d0',
      cancelled: '#991b1b',
      cancelledBg: '#fef2f2',
      cancelledBorder: '#fecaca',
      overdue: '#dc2626',
      overdueB: '#fef2f2',
      overdueBorder: '#fecaca',
      warning: '#d97706',
      warningBg: '#fffbeb',
      warningBorder: '#fde68a',
    },

    // Basic
    black: '#0d0d0d',
    white: '#fff',
    red: '#dc2626',
    amber: '#d97706',
    green: '#16a34a',
    blue: '#2383e2',
  },

  // ===== BUTTON STYLES =====
  buttons: {
    primary: {
      height: '40px',
      padding: '0 16px',
      fontSize: '14px',
      fontWeight: 500,
      borderRadius: '6px',
      bg: '#0d0d0d',
      color: '#fff',
      hoverBg: '#222',
    },
    secondary: {
      height: '40px',
      padding: '0 16px',
      fontSize: '14px',
      fontWeight: 500,
      borderRadius: '6px',
      bg: '#fff',
      color: '#0d0d0d',
      border: '1px solid #d0d0ce',
      hoverBg: '#f5f5f5',
    },
    accent: {
      height: '40px',
      padding: '0 16px',
      fontSize: '14px',
      fontWeight: 500,
      borderRadius: '6px',
      bg: '#2383e2',
      color: '#fff',
      hoverOpacity: 0.9,
    },
    ghost: {
      height: '40px',
      padding: '0 16px',
      fontSize: '14px',
      fontWeight: 500,
      borderRadius: '6px',
      bg: 'transparent',
      color: '#555',
      hoverBg: '#f0f0ee',
    },
    danger: {
      height: '40px',
      padding: '0 16px',
      fontSize: '14px',
      fontWeight: 500,
      borderRadius: '6px',
      bg: '#fff',
      color: '#dc2626',
      border: '1px solid #fca5a5',
      hoverBg: '#fef2f2',
    },
    small: {
      height: '32px',
      padding: '0 12px',
      fontSize: '12px',
      fontWeight: 500,
      borderRadius: '6px',
    },
    large: {
      height: '48px',
      padding: '0 20px',
      fontSize: '14px',
      fontWeight: 600,
      borderRadius: '6px',
    },
  },

  // ===== CARD STYLES =====
  card: {
    bg: '#fff',
    border: '1px solid #e8e8e6',
    borderRadius: '8px',
    padding: '16px',
    shadowSm: '0 1px 2px rgba(0, 0, 0, 0.05)',
    shadowMd: '0 4px 6px rgba(0, 0, 0, 0.07)',
  },

  // ===== INPUT STYLES =====
  input: {
    height: '40px',
    padding: '0 12px',
    fontSize: '13px',
    borderRadius: '6px',
    border: '1px solid #d0d0ce',
    bg: '#fff',
    color: '#0d0d0d',
    focusBorder: '#2383e2',
  },

  // ===== TABLE STYLES =====
  table: {
    headerFontSize: '10px',
    headerFontWeight: 600,
    headerLetterSpacing: '0.6px',
    headerPadding: '12px',
    headerBg: 'transparent',
    cellFontSize: '13px',
    cellPadding: '12px',
    borderColor: '#e8e8e6',
    hoverBg: '#fafaf8',
  },

  // ===== BADGE STYLES =====
  badge: {
    padding: '4px 8px',
    fontSize: '11px',
    fontWeight: 600,
    borderRadius: '4px',
    letterSpacing: '0.2px',
  },

  // ===== RESPONSIVE BREAKPOINTS =====
  breakpoints: {
    mobile: '480px',
    tablet: '768px',
    desktop: '1024px',
    wide: '1280px',
    ultrawide: '1536px',
  },

  // ===== Z-INDEX SCALE =====
  zIndex: {
    dropdown: 100,
    modal: 1000,
    toast: 1200,
    tooltip: 1300,
  },

  // ===== TRANSITIONS =====
  transitions: {
    fast: '150ms ease-in-out',
    normal: '200ms ease-in-out',
    slow: '300ms ease-in-out',
  },

  // ===== BORDER RADIUS =====
  borderRadius: {
    xs: '3px',
    sm: '4px',
    md: '6px',
    lg: '8px',
    xl: '12px',
    full: '9999px',
  },
};

/**
 * Helper: Generate CSS variables from tokens
 * Usage: in :root { ... }
 */
export const generateCSSVariables = () => {
  const vars = {};

  // Spacing
  Object.entries(designTokens.spacing).forEach(([key, value]) => {
    vars[`--spacing-${key}`] = value;
  });

  // Colors
  Object.entries(designTokens.colors).forEach(([key, value]) => {
    if (typeof value === 'string') {
      vars[`--color-${key}`] = value;
    } else {
      Object.entries(value).forEach(([subkey, subvalue]) => {
        vars[`--color-${key}-${subkey}`] = subvalue;
      });
    }
  });

  // Breakpoints
  Object.entries(designTokens.breakpoints).forEach(([key, value]) => {
    vars[`--bp-${key}`] = value;
  });

  // Z-Index
  Object.entries(designTokens.zIndex).forEach(([key, value]) => {
    vars[`--z-${key}`] = value;
  });

  // Border Radius
  Object.entries(designTokens.borderRadius).forEach(([key, value]) => {
    vars[`--br-${key}`] = value;
  });

  // Transitions
  Object.entries(designTokens.transitions).forEach(([key, value]) => {
    vars[`--transition-${key}`] = value;
  });

  return vars;
};

export default designTokens;
