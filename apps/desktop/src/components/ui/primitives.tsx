import type { CSSProperties, ReactNode } from 'react'

const cls = (...list: Array<string | false | null | undefined>) => list.filter(Boolean).join(' ')

/* ============ GlassPanel —— 全站统一玻璃面板 ============ */
interface GlassProps {
  children?: ReactNode
  className?: string
  style?: CSSProperties
  hover?: boolean
  onClick?: () => void
  role?: string
  ariaLabel?: string
}

export function Glass({
  children,
  className,
  style,
  hover,
  onClick,
  role,
  ariaLabel,
}: GlassProps) {
  return (
    <div
      role={role}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cls('glass', hover && 'glass-hover', className)}
      style={style}
    >
      {children}
    </div>
  )
}

/* ============ 文本层级 ============ */
export function Label({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cls('lumina-label', className)} style={style}>
      {children}
    </div>
  )
}

export function Display({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cls('lumina-display', className)} style={style}>
      {children}
    </div>
  )
}

/* ============ Pill —— 轻量标签 ============ */
interface PillProps {
  children: ReactNode
  color?: string
  tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
  onClick?: () => void
  style?: CSSProperties
  title?: string
}

const TONE_COLOR: Record<NonNullable<PillProps['tone']>, string> = {
  neutral: 'var(--text-3)',
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
}

export function Pill({ children, color, tone = 'neutral', onClick, style, title }: PillProps) {
  const c = color ?? TONE_COLOR[tone]
  return (
    <span
      title={title}
      onClick={onClick}
      className={cls('lumina-pill')}
      style={{ borderColor: `${c}66`, color: c, ...style }}
    >
      {children}
    </span>
  )
}