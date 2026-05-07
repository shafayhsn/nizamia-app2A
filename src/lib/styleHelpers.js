/**
 * Style Helpers - Apply design tokens easily
 * Usage: instead of style={{ padding: '16px' }}, use s.pageContent()
 * 
 * This makes refactoring fast and keeps components clean
 */

import designTokens from './designTokens'

const t = designTokens

/**
 * Common style objects - use these instead of inline styles
 */
export const s = {
  // ===== LAYOUT =====
  pageContent: (padding = 'xl') => ({
    padding: `var(--spacing-${padding})`,
    height: 'calc(100vh - var(--topbar-h))',
    overflowY: 'auto',
  }),

  sectionHeader: () => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 'var(--spacing-lg)',
    gap: 'var(--spacing-lg)',
    flexWrap: 'wrap',
  }),

  contentWrapper: (padding = 'lg') => ({
    width: '100%',
    maxWidth: '100%',
    margin: '0 auto',
    padding: `var(--spacing-${padding})`,
  }),

  // ===== TYPOGRAPHY =====
  pageTitle: (margin = true) => ({
    fontSize: 'var(--text-page-title)',
    fontWeight: 700,
    letterSpacing: '-0.5px',
    lineHeight: 1.2,
    color: 'var(--color-text)',
    margin: margin ? `0 0 var(--spacing-md) 0` : 0,
  }),

  sectionTitle: (margin = true) => ({
    fontSize: 'var(--text-section-title)',
    fontWeight: 700,
    letterSpacing: '-0.3px',
    lineHeight: 1.3,
    color: 'var(--color-text)',
    margin: margin ? `0 0 var(--spacing-lg) 0` : 0,
  }),

  subtitle: (margin = true) => ({
    fontSize: 'var(--text-subtitle)',
    fontWeight: 600,
    lineHeight: 1.4,
    color: 'var(--color-text)',
    margin: margin ? `0 0 var(--spacing-lg) 0` : 0,
  }),

  bodyText: (size = 'body', color = 'text') => ({
    fontSize: `var(--text-${size})`,
    color: `var(--color-${color})`,
    lineHeight: 1.5,
  }),

  label: () => ({
    fontSize: 'var(--text-label)',
    fontWeight: 500,
    color: 'var(--color-text-mid)',
    marginBottom: 'var(--spacing-sm)',
    display: 'block',
  }),

  // ===== SPACING =====
  mb: (size = 'lg') => ({ marginBottom: `var(--spacing-${size})` }),
  mt: (size = 'lg') => ({ marginTop: `var(--spacing-${size})` }),
  mx: (size = 'lg') => ({ marginLeft: `var(--spacing-${size})`, marginRight: `var(--spacing-${size})` }),
  my: (size = 'lg') => ({ marginTop: `var(--spacing-${size})`, marginBottom: `var(--spacing-${size})` }),
  p: (size = 'lg') => ({ padding: `var(--spacing-${size})` }),
  px: (size = 'lg') => ({ paddingLeft: `var(--spacing-${size})`, paddingRight: `var(--spacing-${size})` }),
  py: (size = 'lg') => ({ paddingTop: `var(--spacing-${size})`, paddingBottom: `var(--spacing-${size})` }),
  gap: (size = 'lg') => ({ gap: `var(--spacing-${size})` }),

  // ===== CARDS =====
  card: () => ({
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--br-lg)',
    transition: 'all var(--transition-normal)',
  }),

  cardPad: (padding = 'lg') => ({
    padding: `var(--spacing-${padding})`,
  }),

  cardWithPad: (padding = 'lg') => ({
    background: 'var(--color-bg-card)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--br-lg)',
    padding: `var(--spacing-${padding})`,
  }),

  // ===== FLEX =====
  flex: (direction = 'row', align = 'center', justify = 'flex-start') => ({
    display: 'flex',
    flexDirection: direction,
    alignItems: align,
    justifyContent: justify,
  }),

  flexBetween: (direction = 'row') => ({
    display: 'flex',
    flexDirection: direction,
    alignItems: 'center',
    justifyContent: 'space-between',
  }),

  flexCol: () => ({
    display: 'flex',
    flexDirection: 'column',
  }),

  flexCenter: () => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),

  flexGap: (size = 'lg', direction = 'row') => ({
    display: 'flex',
    flexDirection: direction,
    gap: `var(--spacing-${size})`,
    alignItems: 'center',
  }),

  // ===== GRID =====
  grid: (cols = 3, gap = 'lg') => ({
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fit, minmax(280px, 1fr))`,
    gap: `var(--spacing-${gap})`,
  }),

  grid2: (gap = 'lg') => ({
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: `var(--spacing-${gap})`,
  }),

  // ===== BUTTONS =====
  btn: (variant = 'primary', size = 'md') => {
    const sizeMap = {
      sm: { height: '32px', padding: '0 var(--spacing-md)', fontSize: 'var(--text-label)' },
      md: { height: '40px', padding: '0 var(--spacing-lg)', fontSize: 'var(--text-body-sm)' },
      lg: { height: '48px', padding: '0 var(--spacing-xl)', fontSize: 'var(--text-body)' },
    }
    const variantMap = {
      primary: { background: 'var(--color-text)', color: '#fff', border: 'none' },
      secondary: { background: '#fff', color: 'var(--color-text)', border: '1px solid var(--color-border-dark)' },
      accent: { background: 'var(--color-accent)', color: '#fff', border: 'none' },
      ghost: { background: 'transparent', color: 'var(--color-text-mid)', border: 'none' },
      danger: { background: '#fff', color: '#dc2626', border: '1px solid #fca5a5' },
    }
    return {
      display: 'inline-flex',
      alignItems: 'center',
      gap: 'var(--spacing-sm)',
      borderRadius: 'var(--br-md)',
      cursor: 'pointer',
      border: 'none',
      transition: 'all var(--transition-fast)',
      whiteSpace: 'nowrap',
      fontFamily: 'var(--font)',
      fontWeight: 500,
      ...sizeMap[size],
      ...variantMap[variant],
    }
  },

  // ===== INPUTS =====
  input: () => ({
    width: '100%',
    height: '40px',
    padding: '0 var(--spacing-md)',
    border: '1px solid var(--color-border-dark)',
    borderRadius: 'var(--br-md)',
    fontSize: 'var(--text-body-sm)',
    fontFamily: 'var(--font)',
    color: 'var(--color-text)',
    background: '#fff',
    outline: 'none',
    transition: 'border-color var(--transition-fast)',
  }),

  textarea: () => ({
    width: '100%',
    padding: 'var(--spacing-md)',
    border: '1px solid var(--color-border-dark)',
    borderRadius: 'var(--br-md)',
    fontSize: 'var(--text-body-sm)',
    fontFamily: 'var(--font)',
    color: 'var(--color-text)',
    background: '#fff',
    outline: 'none',
    minHeight: '72px',
    resize: 'vertical',
  }),

  // ===== COLORS =====
  textColor: (level = 'text') => ({ color: `var(--color-${level})` }),
  bgColor: (level = 'bg') => ({ background: `var(--color-${level})` }),
  borderColor: (level = 'border') => ({ borderColor: `var(--color-${level})` }),

  // ===== BADGES =====
  badge: (variant = 'active') => ({
    display: 'inline-flex',
    alignItems: 'center',
    padding: 'var(--spacing-sm) var(--spacing-md)',
    borderRadius: 'var(--br-sm)',
    fontSize: 'var(--text-label)',
    fontWeight: 600,
    whiteSpace: 'nowrap',
  }),

  badgeActive: () => ({
    ...s.badge(),
    background: '#eff6ff',
    color: '#1d4ed8',
    border: '1px solid #bfdbfe',
  }),

  badgeDraft: () => ({
    ...s.badge(),
    background: '#f5f5f3',
    color: '#666',
    border: '1px solid #e0e0de',
  }),

  badgePending: () => ({
    ...s.badge(),
    background: '#fef3c7',
    color: '#92400e',
    border: '1px solid #fde68a',
  }),

  badgeOverdue: () => ({
    ...s.badge(),
    background: '#fef2f2',
    color: '#dc2626',
    border: '1px solid #fecaca',
  }),

  // ===== TABLES =====
  tableWrap: () => ({
    overflowX: 'auto',
    borderRadius: 'var(--br-lg)',
  }),

  tableHeaderCell: () => ({
    fontSize: 'var(--text-label-sm)',
    fontWeight: 600,
    letterSpacing: '0.6px',
    textTransform: 'uppercase',
    color: 'var(--color-text-light)',
    padding: 'var(--spacing-md)',
    textAlign: 'left',
    borderBottom: '1px solid var(--color-border)',
    whiteSpace: 'nowrap',
  }),

  tableDataCell: () => ({
    padding: 'var(--spacing-md)',
    fontSize: 'var(--text-body-sm)',
    color: 'var(--color-text)',
    borderBottom: '1px solid var(--color-border)',
  }),

  // ===== COMMON PATTERNS =====
  emptyState: () => ({
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--spacing-xxxl)',
    textAlign: 'center',
    color: 'var(--color-text-light)',
    gap: 'var(--spacing-lg)',
  }),

  divider: (margin = 'xl') => ({
    border: 'none',
    borderTop: '1px solid var(--color-border)',
    margin: `var(--spacing-${margin}) 0`,
  }),

  section: (padding = 'xl') => ({
    padding: `var(--spacing-${padding}) 0`,
  }),

  // ===== RESPONSIVE HELPERS =====
  responsiveGrid: (cols = 3) => ({
    display: 'grid',
    gridTemplateColumns: `repeat(auto-fit, minmax(${280}px, 1fr))`,
    gap: 'var(--spacing-lg)',
  }),

  // ===== TRANSITIONS =====
  transition: (prop = 'all', speed = 'normal') => ({
    transition: `${prop} var(--transition-${speed})`,
  }),

  // ===== SHADOWS =====
  shadow: () => ({
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
  }),

  shadowMd: () => ({
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.07)',
  }),

  // ===== UTILITIES =====
  opacity50: () => ({ opacity: 0.5 }),
  opacity75: () => ({ opacity: 0.75 }),
  cursor: (type = 'pointer') => ({ cursor: type }),
  userSelect: (value = 'none') => ({ userSelect: value }),
}

export default s
