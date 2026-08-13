import type { ButtonHTMLAttributes, CSSProperties, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

type Variant = 'primary' | 'ghost' | 'outline' | 'danger' | 'subtle'

interface UiButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: LucideIcon
  iconRight?: LucideIcon
  children?: ReactNode
  size?: 'sm' | 'md'
  style?: CSSProperties
}

const sizes = {
  sm: { padding: '5px 12px', fontSize: 'var(--text-sm)', gap: 6 },
  md: { padding: '8px 16px', fontSize: 'var(--text-base)', gap: 8 },
}

export default function UiButton({
  variant = 'outline',
  icon: Icon,
  iconRight: IconRight,
  children,
  size = 'sm',
  style,
  disabled,
  className,
  ...rest
}: UiButtonProps) {
  const dims = sizes[size]
  const cls = ['lumina-btn', `lumina-btn-${variant}`, disabled && 'is-disabled', className].filter(Boolean).join(' ')
  return (
    <button {...rest} disabled={disabled} className={cls} style={{ ...dims, ...style }}>
      {Icon && <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2} />}
      {children}
      {IconRight && <IconRight size={14} strokeWidth={2} />}
    </button>
  )
}