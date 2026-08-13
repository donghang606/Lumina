export type Skin = 'glass' | 'nothing' | 'bloomberg' | 'effect'

export interface SkinInfo {
  label: string
  /** 皮肤自带的固定明暗模式 */
  mode: 'light' | 'dark'
}

export const SKINS: Record<Skin, SkinInfo> = {
  glass: { label: 'Glass（科技玻璃）', mode: 'light' },
  nothing: { label: 'Nothing（极简工业）', mode: 'dark' },
  bloomberg: { label: 'Bloomberg（终端）', mode: 'dark' },
  effect: { label: 'Effect（赛博玻璃）', mode: 'dark' },
}

export function isSkin(v: unknown): v is Skin {
  return v === 'glass' || v === 'nothing' || v === 'bloomberg' || v === 'effect'
}

/** 皮肤的固定明暗模式 */
export function skinMode(skin: Skin): 'light' | 'dark' {
  return SKINS[skin].mode
}
