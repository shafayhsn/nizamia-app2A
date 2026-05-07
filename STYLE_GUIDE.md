/**
 * NIZAMIA APP-2A STYLE GUIDE
 * Comprehensive guide to the unified design system
 * Updated: May 2026
 * 
 * This guide ensures all developers use consistent spacing, typography, 
 * colors, and responsive patterns throughout the application.
 */

# SPACING SCALE

Use these spacing values exclusively. Never hardcode pixel values.

```
--spacing-xs:   4px    (small gaps, minimal)
--spacing-sm:   8px    (small padding/margins)
--spacing-md:   12px   (standard padding)
--spacing-lg:   16px   (section padding, card padding)
--spacing-xl:   24px   (page padding, large gaps)
--spacing-xxl:  32px   (header padding, major sections)
--spacing-xxxl: 48px   (empty state padding)
```

## Usage Examples

```jsx
// CSS Classes
<div style={{ padding: 'var(--spacing-lg)' }}>Content</div>
<div style={{ marginBottom: 'var(--spacing-md)' }}>Title</div>
<div style={{ gap: 'var(--spacing-sm)' }}>Flex items</div>

// Or use design tokens in JS
import designTokens from '@/lib/designTokens'

const padding = designTokens.spacing.lg  // "16px"
```

---

# TYPOGRAPHY

## Font Family
- **Body & UI**: 'Geist', -apple-system, sans-serif
- **Code/Numbers**: 'Geist Mono', 'SF Mono', monospace

## Text Sizes (Always use CSS variables)

```
Page Title:    var(--text-page-title)    28px, weight 700
Section Title: var(--text-section-title) 20px, weight 700
Subtitle:      var(--text-subtitle)      16px, weight 600
Body Large:    var(--text-body-lg)       14px, weight 400
Body:          var(--text-body)          13px, weight 400
Body Small:    var(--text-body-sm)       12px, weight 400
Label:         var(--text-label)         11px, weight 500
Label Small:   var(--text-label-sm)      10px, weight 600
```

## Usage

```jsx
// Good ✓
<h1 style={{ fontSize: 'var(--text-page-title)', fontWeight: 700 }}>
  Dashboard
</h1>

<p style={{ fontSize: 'var(--text-body)', color: 'var(--color-text)' }}>
  This is body text
</p>

// Bad ✗
<h1 style={{ fontSize: '28px', fontWeight: 'bold' }}>Dashboard</h1>
<p style={{ fontSize: '13px' }}>This is body text</p>
```

---

# COLORS

Always reference CSS variables, never hardcode hex values.

## Text Colors
```
--color-text:        #0d0d0d  (primary text)
--color-text-mid:    #555     (secondary text)
--color-text-light:  #999     (tertiary, muted)
--color-text-lighter: #bbb    (very light)
```

## Background Colors
```
--color-bg:          #f7f7f5  (page background)
--color-bg-hover:    #f0f0ee  (hover state)
--color-bg-input:    #fff     (input/card background)
--color-bg-card:     #fff     (card background)
```

## Borders
```
--color-border:      #e8e8e6  (standard border)
--color-border-dark: #d0d0ce  (darker border, inputs)
--color-border-light: #f0f0ee (light border)
```

## Semantic Colors
```
--color-accent:      #2383e2  (blue, primary actions)
--color-status-active:     #10b981 (green)
--color-status-draft:      #f59e0b (amber)
--color-status-pending:    #f97316 (orange)
--color-status-shipped:    #0ea5e9 (sky blue)
--color-status-overdue:    #dc2626 (red)
```

## Usage

```jsx
// Good ✓
<button style={{ background: 'var(--color-accent)' }}>Submit</button>
<div style={{ color: 'var(--color-text-light)' }}>Subtitle</div>

// Bad ✗
<button style={{ background: '#2383e2' }}>Submit</button>
<div style={{ color: '#999' }}>Subtitle</div>
```

---

# BUTTONS

## Classes
```
.btn-primary     Black background, white text (main actions)
.btn-secondary   White background, black text, border
.btn-accent      Blue background, white text
.btn-ghost       Transparent, gray text
.btn-danger      White background, red text
.btn-sm          32px height, smaller padding
.btn-lg          48px height, larger padding
```

## Sizes
```
Default: 40px height, 16px horizontal padding, 14px font
Small:   32px height, 12px horizontal padding, 12px font
Large:   48px height, 20px horizontal padding, 14px font
```

## Usage

```jsx
// Good ✓
<button className="btn btn-primary">Save</button>
<button className="btn btn-secondary btn-sm">Cancel</button>
<button className="btn btn-danger btn-lg">Delete</button>

// Bad ✗
<button style={{ background: 'black', padding: '12px 16px' }}>Save</button>
```

---

# INPUTS & FORMS

## Input Height & Padding
```
Standard: 40px height, 12px horizontal padding
Font:     13px
Border:   1px solid var(--color-border-dark)
Border Radius: 6px
Focus:    var(--color-accent) border + shadow
```

## Form Layout

```jsx
// Use form-row classes for responsive grids
<div className="form-row form-row-2">
  <input className="input" />
  <input className="input" />
</div>

// On mobile, automatically becomes 1 column
```

## Usage

```jsx
// Good ✓
<input className="input" placeholder="Enter text" />

<div className="form-group">
  <label>Name</label>
  <input className="input" />
</div>

// Bad ✗
<input style={{ padding: '10px', fontSize: '13px' }} />
```

---

# TABLES

## Header
```
Font Size: 10px
Font Weight: 600
Letter Spacing: 0.6px
Text Transform: uppercase
Padding: 12px
Border Bottom: 1px solid var(--color-border)
```

## Cells
```
Font Size: 13px
Padding: 12px
Border Bottom: 1px solid var(--color-border)
Hover Background: #fafaf8
```

## Usage

```jsx
// Wrap in .table-wrap for responsive scrolling
<div className="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Column 1</th>
        <th>Column 2</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Data 1</td>
        <td>Data 2</td>
      </tr>
    </tbody>
  </table>
</div>
```

---

# BADGES & STATUS

## Badge Variants
```
.badge-active     Green (Active/Shipped)
.badge-draft      Gray (Draft)
.badge-pending    Amber (Pending)
.badge-completed  Green (Completed)
.badge-overdue    Red (Overdue)
.badge-warning    Amber (Warning)
.badge-cancelled  Red (Cancelled)
```

## Usage

```jsx
<span className="badge badge-active">Active</span>
<span className="badge badge-pending">Pending</span>
<span className="badge badge-overdue">Overdue</span>
```

---

# RESPONSIVE DESIGN

## Breakpoints
```
Mobile:     < 480px
Tablet:     < 768px
Desktop:    < 1024px
Wide:       < 1280px
Ultra-wide: > 1280px
```

## Grid Classes

```jsx
// Auto-responsive grids
<div className="grid-2">  {/* 2 cols, auto-responsive */}
  <Card />
  <Card />
</div>

<div className="grid-3">  {/* 3 cols, auto-responsive */}
  <Card />
  <Card />
  <Card />
</div>

<div className="grid-4">  {/* 4 cols, auto-responsive */}
  <Card />
  <Card />
  <Card />
  <Card />
</div>
```

## Form Rows

```jsx
// Automatically responsive
<div className="form-row-2">
  <input /> {/* Two columns on desktop */}
  <input /> {/* One column on tablet/mobile */}
</div>

<div className="form-row-3">
  <input />
  <input />
  <input />
</div>
```

## Media Queries

```css
/* Desktop (> 1024px) */
/* Default styles */

/* Tablet (≤ 1024px) */
@media (max-width: 1024px) {
  /* tablet-specific */
}

/* Mobile (≤ 768px) */
@media (max-width: 768px) {
  /* mobile-specific */
}

/* Small Mobile (≤ 480px) */
@media (max-width: 480px) {
  /* small mobile-specific */
}
```

---

# PAGE LAYOUT STRUCTURE

All pages should follow this structure:

```jsx
<div className="page-content">
  <div className="section-header">
    <div>
      <h1 className="page-title">Page Title</h1>
      <p className="section-subtitle">Optional subtitle</p>
    </div>
    <div style={{ display: 'flex', gap: 'var(--spacing-md)' }}>
      <button className="btn btn-primary">+ New Item</button>
      <button className="btn btn-secondary">Refresh</button>
    </div>
  </div>

  <div className="table-wrap">
    <table>
      {/* table content */}
    </table>
  </div>
</div>
```

---

# COMMON PATTERNS

## Card with Title
```jsx
<div className="card">
  <div className="card-pad">
    <h2 style={{ fontSize: 'var(--text-subtitle)', marginBottom: 'var(--spacing-lg)' }}>
      Card Title
    </h2>
    {/* content */}
  </div>
</div>
```

## List Item
```jsx
<div className="list-item">
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <span style={{ fontSize: 'var(--text-body)' }}>Item Title</span>
    <button className="btn btn-sm btn-ghost">Edit</button>
  </div>
</div>
```

## Empty State
```jsx
<div className="empty-state">
  <svg>...</svg>
  <p>No items found</p>
  <button className="btn btn-primary">Create Item</button>
</div>
```

## Flex Row with Gap
```jsx
<div style={{ display: 'flex', gap: 'var(--spacing-lg)', alignItems: 'center' }}>
  <Item />
  <Item />
  <Item />
</div>
```

---

# DEBUGGING CONSISTENCY

If something looks wrong:

1. **Check spacing**: Are you using `var(--spacing-*)` instead of hardcoded px?
2. **Check colors**: Are you using `var(--color-*)` instead of hardcoded hex?
3. **Check fonts**: Are sizes using `var(--text-*)`?
4. **Check button styles**: Are buttons using `.btn` + variant class?
5. **Check responsiveness**: Does it work on mobile, tablet, and desktop?

---

# IMPORT DESIGN TOKENS IN JS

```javascript
import designTokens from '@/lib/designTokens'

// Access spacing
const padding = designTokens.spacing.lg  // "16px"

// Access colors
const textColor = designTokens.colors.text  // "#0d0d0d"

// Access typography
const titleSize = designTokens.typography.pageTitle.size  // "28px"

// Access button styles
const primaryBtn = designTokens.buttons.primary
// { height: '40px', padding: '0 16px', ... }
```

---

# FINAL CHECKLIST

- [ ] All spacing uses CSS variables
- [ ] All colors use CSS variables
- [ ] All font sizes use CSS variables
- [ ] All buttons have proper classes
- [ ] Page is responsive on mobile/tablet/desktop
- [ ] Icons are properly sized
- [ ] Forms are properly styled
- [ ] Tables follow the standard format
- [ ] Status badges use correct variants
- [ ] No hardcoded px values except in specific edge cases
