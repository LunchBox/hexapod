# Sci-Fi Tab & Overall Style Redesign

## Goal

Replace the accordion UI with clean tab design. Replace the white-block pseudo-element folded corner with `clip-path`. Apply a Matrix Architect-scene-inspired sci-fi aesthetic: white background, minimal lines, professional tool feel — not dark-theme hacker aesthetic.

## Color Palette

| Role | Value | Usage |
|------|-------|-------|
| Page background | `#fff` | body |
| Panel surface | `#fafafa` | card backgrounds, tab inactive |
| Subtle surface | `#f5f5f5` | hover states |
| Border | `#e0e0e0` | fieldset, tab borders, separators |
| Text primary | `#222` | labels, content |
| Text secondary | `#888` | hints, legends |
| Accent bg | `cornsilk` (#FFF8DC) | active tab, active button |
| Accent border | `orange` (#FFA500) | active tab border, active button border |

Existing `.btns a.active` already uses cornsilk + orange — extend this accent to tabs.

## Typography

- Font: Inter / system-ui (already set in `src/index.css`)
- Size: 13px body, 12px controls, 10px section labels
- Section labels: uppercase, `letter-spacing: 1px`, color `#999`, hairline bottom border

## Tab Design

### Folded Corner — clip-path

Replace `.tab-item:after` (white square rotated 45deg) with `clip-path` on the tab element itself:

```css
.tab-item {
  clip-path: polygon(
    0 0,
    calc(100% - 14px) 0,
    100% 12px,
    100% 100%,
    0 100%
  );
}
```

This physically cuts the top-right corner, making it truly transparent. No background-color dependency. The cut corner reveals whatever is behind it — no white block bleed.

### Tab Layout

- Horizontal tab bar above content, subtle bottom border on the whole bar
- Active tab: `cornsilk` background, `orange` left/top/right border, bottom border matches active content area (white)
- Inactive tab: `#fafafa` background, `#e0e0e0` border
- Hover: `#f5f5f5` background transition
- Same tab labels: Control, Servos, Attributes, Status

### Tab Bar Separator

A single `0.5px` or `1px #e0e0e0` line across the full width below the tab bar, connecting to the active tab's bottom edge.

## Global Style Changes

### Borders

- All borders: `1px solid #eaeaea` (lighter than current `#ccc`/`#ddd`)
- Fieldset: thin border, subtle rounding (2px)
- Separators: `0.5px` where browser support allows, fallback `1px #eee`

### Buttons (.control_btn)

Keep existing `.btns a` structure, refresh colors:
- Default: `#fff` bg, `#e0e0e0` border, `#222` text
- Hover: `#f5f5f5` bg
- Active: `cornsilk` bg, `orange` border (unchanged from current)

### Section Labels

Replace current inline styles with a reusable CSS class:
```css
.section-label {
  color: #999;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  margin: 12px 0 4px;
  padding-left: 2px;
  border-bottom: 0.5px solid #e8e8e8;
}
```

### Fieldset / Legend

Lighten borders, reduce visual weight:
```css
fieldset {
  border: 1px solid #e8e8e8;
  border-radius: 2px;
  margin-bottom: 8px;
  padding: 6px 8px;
}
legend {
  font-size: 11px;
  color: #888;
}
```

## Files to Change

1. **`src/App.tsx`** — Already reverted to tab design. May need minor class name updates.
2. **`src/App.css`** — Remove accordion CSS (done). Add tab clip-path styles.
3. **`stylesheets/application.css`** — Update `.tab-item`, `.tab-item.active`, global fieldset/legend/button colors. Remove old `.tab-item:after` hack.
4. **`src/index.css`** — Update `body` background to `#fff`, add `.section-label` class.
5. **`src/components/ControlPanel.tsx`** — Replace inline `sectionLabel` style with CSS class.

## What NOT to Change

- Three.js scene / canvas rendering
- Component logic or data flow
- Layout grid structure
- Existing `.btns a` functionality
- StatusBar, Toolbar components
