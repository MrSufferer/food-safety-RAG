# Brand — Rà soát cho quán

## Product description

Checklist chuẩn bị an toàn thực phẩm có nguồn cho quán cà phê hoặc takeaway ở Đà Nẵng. The interface uses a descriptive label; no separate product or café name was supplied.

## Visual direction

Ivory Linen is a warm, quiet palette for a practical local guide. Use generous ivory space, crisp dark text, fine borders, and terracotta for actions and source markers. Keep cards and reading surfaces solid so citations and checklist steps stay easy to scan.

| Role | Light | Dark |
| --- | --- | --- |
| Page | `#FAF8F3` | `#1A1816` |
| Elevated surface | `#FFFFFF` | `#25221F` |
| Soft surface | `#F4E7DF` | `#3B2A22` |
| Main text | `#1F1A15` | `#F5F0E8` |
| Muted text | `#5B5852` | `#C7BFB3` |
| Primary | `#9E4C2C` | `#DC9474` |
| Strong primary | `#793719` | `#F0AE90` |

The palette seeds are Ivory Linen's ivory page (`oklch(0.98 0.005 75)`), terracotta primary (`oklch(0.48 0.12 30)`), and deep warm text (`oklch(0.20 0.01 30)`). The app maps these roles to CSS variables in `public/styles.css`; its implementation does not use shadcn tokens.

## Typography

- **Be Vietnam Pro** for interface text, questions, buttons, and citations.
- **Literata** for the wordmark and major headings.
- Keep Vietnamese diacritics intact; use the system sans and Georgia fallbacks if the web fonts are unavailable.

## Gradients

Use the two CSS variables in `public/styles.css` sparingly:

- `--gradient-bg`: a low-contrast ivory-to-warm-neutral page background; dark mode shifts between warm charcoal tones.
- `--gradient-accent`: a restrained terracotta-to-ochre marker for the cited route card; dark mode uses lighter warm accents.

Keep text on solid surfaces and do not add gradients to every card or control.

## Voice

Write in clear, direct Vietnamese. Address the café owner as “bạn.” Separate facts the owner provided from requirements stated by a source. Put citations beside the claim they support, and label unsettled details “chưa xác minh.” Avoid hype and do not imply that the checklist guarantees compliance, eligibility, readiness, fees, or deadlines unless a cited source says so.
