/** A message: plain text, or plural forms chosen with `Intl.PluralRules` from the `count` variable. */
export type Plural = { zero?: string; one?: string; two?: string; few?: string; many?: string; other: string }
export type Msg = string | Plural

/** A translation of the English catalog `E`: exactly the same keys, each with a message. */
export type Catalog<E> = { [K in keyof E]: Msg }
