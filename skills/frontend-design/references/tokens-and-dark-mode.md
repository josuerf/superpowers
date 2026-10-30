# Dark Mode and Design Token Scales

Part of superpowers-prepared:frontend-design. Read it before you define the
design tokens or implement a dark theme.

## Dark Mode Implementation

When the project needs dark mode, implement it properly — not as an afterthought. But first, evaluate whether dark mode is actually appropriate for the product. Not every interface benefits from it — light mode is often the right default for content-heavy, trust-sensitive, or general-audience products. Do not add dark mode just because it's trendy.

- Use CSS custom properties for all colors: `--color-bg`, `--color-text`, `--color-surface`
- Apply via `prefers-color-scheme` media query for system default + class toggle for user override
- Dark mode is NOT inverted colors — use desaturated, lighter tonal variants with adjusted contrast
- Shadows become less visible in dark mode — use border or elevated surface colors instead
- Test all semantic colors (error red, success green, warning amber) against dark backgrounds
- Store user preference in `localStorage`; respect system preference as default

---

## Design Token Scales

Beyond color and spacing tokens (covered in SKILL.md's Quality Standards §6), define these additional token scales to prevent ad-hoc values:

- **Radius scale** — Border radius values tied to the design direction (e.g., `--radius-sm: 4px`, `--radius-md: 8px`, `--radius-lg: 16px`). A brutalist design uses sharp radii; glassmorphism uses larger values.
- **Elevation scale** — Shadow definitions for consistent depth (e.g., `--shadow-sm`, `--shadow-md`, `--shadow-lg`). These must match the chosen style — flat design uses none, neumorphism uses dual light/dark shadows.
