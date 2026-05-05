// Zero-dep ANSI colors — não usamos chalk/kleur pra manter o CLI standalone
// e fácil de compilar com `bun build --compile`.

const ESC = '\x1b['
const RESET = `${ESC}0m`

const wrap = (open: number, close: number) => (s: string) => `${ESC}${open}m${s}${ESC}${close}m`

export const c = {
  // Foreground
  red:     wrap(31, 39),
  green:   wrap(32, 39),
  yellow:  wrap(33, 39),
  blue:    wrap(34, 39),
  magenta: wrap(35, 39),
  cyan:    wrap(36, 39),
  white:   wrap(37, 39),
  gray:    wrap(90, 39),
  // Bright
  emerald: wrap(92, 39),
  amber:   wrap(93, 39),
  rose:    wrap(91, 39),
  sky:     wrap(96, 39),
  // Modifiers
  bold:    wrap(1, 22),
  dim:     wrap(2, 22),
  italic:  wrap(3, 23),
  under:   wrap(4, 24),
  invert:  wrap(7, 27),
  // Backgrounds
  bgRed:    wrap(41, 49),
  bgAmber:  wrap(43, 49),
  bgEmerald:wrap(42, 49),
}

export const sym = {
  ok: c.emerald('●'),
  err: c.rose('●'),
  warn: c.amber('●'),
  idle: c.gray('○'),
  arrow: c.gray('›'),
  bullet: c.gray('•'),
  triangle: c.amber('▶'),
  check: c.emerald('✓'),
  cross: c.rose('✕'),
  star: c.amber('★'),
  spark: c.cyan('━'),
  lock: c.rose('⊘'),
  dot: c.gray('·'),
}

// Detecta se stdout suporta cor. Pipe ou redirect → desliga.
export const COLOR_ENABLED = process.stdout.isTTY && process.env.NO_COLOR !== '1'

export function strip(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[\d+m/g, '')
}

export function visibleLength(s: string): number {
  return strip(s).length
}

// no-op color helpers when disabled
if (!COLOR_ENABLED) {
  for (const k of Object.keys(c) as Array<keyof typeof c>) {
    ;(c as Record<string, (s: string) => string>)[k] = (s: string) => s
  }
  for (const k of Object.keys(sym) as Array<keyof typeof sym>) {
    ;(sym as Record<string, string>)[k] = strip(sym[k])
  }
}

export { RESET }
