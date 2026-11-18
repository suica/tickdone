import type { RepeatRule } from '../types'
import { Popover, type Anchor } from './Popover'

export interface DateValue {
  dueDate?: string
  dueTime?: string
  reminder?: number | null
  repeat?: RepeatRule | null
}

export function DatePicker({ anchor, value, onChange, onClose }: { anchor: Anchor; value: DateValue; onChange: (v: DateValue) => void; onClose: () => void }) {
  return (
    <Popover anchor={anchor} onClose={onClose}>
      <div style={{ padding: 16 }}>
        <input type="date" value={value.dueDate ?? ''} onChange={(e) => onChange({ ...value, dueDate: e.target.value || undefined })} />
      </div>
    </Popover>
  )
}
