import { t } from '../i18n'

/** A short length in the current language: "1h 25m", "25m", "0m". */
export function fmtDur(ms: number) {
  const m = Math.floor(ms / 60000)
  const h = Math.floor(m / 60)
  if (!h) return t('misc.focus.durM', { minutes: m })
  return m % 60 ? t('misc.focus.durHM', { hours: h, minutes: m % 60 }) : t('misc.focus.durH', { hours: h })
}
