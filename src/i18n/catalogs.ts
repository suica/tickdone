import commonEn from './common/en'
import commonZhCN from './common/zh-CN'
import commonZhTW from './common/zh-TW'
import commonJa from './common/ja'
import commonKo from './common/ko'
import commonEs from './common/es'
import commonFr from './common/fr'
import commonDe from './common/de'
import commonPtBR from './common/pt-BR'
import commonRu from './common/ru'
import shellEn from './shell/en'
import shellZhCN from './shell/zh-CN'
import shellZhTW from './shell/zh-TW'
import shellJa from './shell/ja'
import shellKo from './shell/ko'
import shellEs from './shell/es'
import shellFr from './shell/fr'
import shellDe from './shell/de'
import shellPtBR from './shell/pt-BR'
import shellRu from './shell/ru'
import tasksEn from './tasks/en'
import tasksZhCN from './tasks/zh-CN'
import tasksZhTW from './tasks/zh-TW'
import tasksJa from './tasks/ja'
import tasksKo from './tasks/ko'
import tasksEs from './tasks/es'
import tasksFr from './tasks/fr'
import tasksDe from './tasks/de'
import tasksPtBR from './tasks/pt-BR'
import tasksRu from './tasks/ru'
import calendarEn from './calendar/en'
import calendarZhCN from './calendar/zh-CN'
import calendarZhTW from './calendar/zh-TW'
import calendarJa from './calendar/ja'
import calendarKo from './calendar/ko'
import calendarEs from './calendar/es'
import calendarFr from './calendar/fr'
import calendarDe from './calendar/de'
import calendarPtBR from './calendar/pt-BR'
import calendarRu from './calendar/ru'
import miscEn from './misc/en'
import miscZhCN from './misc/zh-CN'
import miscZhTW from './misc/zh-TW'
import miscJa from './misc/ja'
import miscKo from './misc/ko'
import miscEs from './misc/es'
import miscFr from './misc/fr'
import miscDe from './misc/de'
import miscPtBR from './misc/pt-BR'
import miscRu from './misc/ru'
import type { Locale } from './locales'
import type { Msg } from './types'

/** The English catalog, merged from every area. Its keys are the valid message keys. */
export const en = { ...commonEn, ...shellEn, ...tasksEn, ...calendarEn, ...miscEn }

export type MessageKey = keyof typeof en

export const catalogs: Record<Locale, Record<MessageKey, Msg>> = {
  en: { ...commonEn, ...shellEn, ...tasksEn, ...calendarEn, ...miscEn },
  'zh-CN': { ...commonZhCN, ...shellZhCN, ...tasksZhCN, ...calendarZhCN, ...miscZhCN },
  'zh-TW': { ...commonZhTW, ...shellZhTW, ...tasksZhTW, ...calendarZhTW, ...miscZhTW },
  ja: { ...commonJa, ...shellJa, ...tasksJa, ...calendarJa, ...miscJa },
  ko: { ...commonKo, ...shellKo, ...tasksKo, ...calendarKo, ...miscKo },
  es: { ...commonEs, ...shellEs, ...tasksEs, ...calendarEs, ...miscEs },
  fr: { ...commonFr, ...shellFr, ...tasksFr, ...calendarFr, ...miscFr },
  de: { ...commonDe, ...shellDe, ...tasksDe, ...calendarDe, ...miscDe },
  'pt-BR': { ...commonPtBR, ...shellPtBR, ...tasksPtBR, ...calendarPtBR, ...miscPtBR },
  ru: { ...commonRu, ...shellRu, ...tasksRu, ...calendarRu, ...miscRu },
}
