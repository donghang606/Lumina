import { useEffect, useState } from 'react'
import { configService, type Settings } from '../services/configService'
import { isSkin, skinMode, type Skin } from '../lib/theme'

export const DEFAULT_SKIN: Skin = 'glass'

function apply(skin: Skin) {
  const mode = skinMode(skin)
  document.body.setAttribute('arco-theme', mode)
  document.documentElement.style.colorScheme = mode
  document.body.dataset.skin = skin
}

export function useTheme() {
  const [skin, setSkinState] = useState<Skin>(DEFAULT_SKIN)

  useEffect(() => {
    void (async () => {
      try {
        const s: Settings | null = await configService.getSettings()
        const sk = isSkin(s?.skin) ? s.skin : DEFAULT_SKIN
        setSkinState(sk)
        apply(sk)
      } catch {
        apply(DEFAULT_SKIN)
      }
    })()
  }, [])

  return {
    skin,
    setSkin: (s: Skin) => {
      setSkinState(s)
      apply(s)
    },
  }
}
