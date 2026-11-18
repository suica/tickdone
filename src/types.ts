// Priority values: 0 none / 1 low / 3 medium / 5 high
export type Priority = 0 | 1 | 3 | 5

export type RepeatRule =
  | { kind: 'daily'; interval: number }
  | { kind: 'weekly'; interval: number; days?: number[] } // 0 = Sunday
  | { kind: 'weekdays' }
  | { kind: 'monthly'; interval: number }
  | { kind: 'yearly'; interval: number }

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export type TaskStatus = 0 | 2 | -1 // 0 open, 2 completed, -1 won't do

export interface Task {
  id: string
  title: string
  content: string
  listId: string
  sectionId?: string
  tags: string[]
  priority: Priority
  dueDate?: string // yyyy-MM-dd
  dueTime?: string // HH:mm
  duration?: number // minutes; how long a timed task is in the calendar (shown as 30 minutes when unset)
  reminder?: number | null // minutes before; 0 = on time
  repeat?: RepeatRule | null
  status: TaskStatus
  completedAt?: number
  createdAt: number
  modifiedAt: number
  order: number
  subtasks: Subtask[]
  pinned?: boolean
  deleted?: boolean
  parentId?: string
}

export interface Section {
  id: string
  name: string
}

export interface TaskList {
  id: string
  name: string
  color?: string
  folderId?: string
  sections: Section[]
  view: 'list' | 'kanban'
  order: number
}

export interface Folder {
  id: string
  name: string
  collapsed?: boolean
  order: number
}

export interface Tag {
  name: string
  color?: string
}

export interface Habit {
  id: string
  name: string
  icon: string
  color: string
  checkins: Record<string, true>
  createdAt: number
  order: number
  archived?: boolean
  /** Time of day it belongs to; "other" when unset */
  section?: HabitSection
  /** Goal in days (keep it up for N days) */
  goalDays?: number
  /** How often to check in; daily when unset */
  frequency?: HabitFrequency
  /** Reminder times, HH:mm */
  reminders?: string[]
  /** Words of encouragement */
  encouragement?: string
}

export type HabitSection = 'morning' | 'afternoon' | 'night' | 'other'
export type HabitFrequency =
  | { kind: 'daily' }
  | { kind: 'weekly'; times: number } // N days a week
  | { kind: 'days'; days: number[] } // given weekdays, 0 = Sunday

export interface FocusRecord {
  id: string
  start: number
  end: number
  taskId?: string
  mode: 'pomo' | 'stopwatch'
}

export interface Settings {
  pomoMinutes: number
  shortBreak: number
  longBreak: number
  weekStartsOn: 0 | 1
  theme: 'light' | 'dark'
  showCompleted: boolean
}

export interface AppData {
  version: 1
  tasks: Task[]
  lists: TaskList[]
  folders: Folder[]
  tags: Tag[]
  habits: Habit[]
  focus: FocusRecord[]
  settings: Settings
}

export type GroupBy = 'date' | 'list' | 'priority' | 'tag' | 'none' | 'section'
export type SortBy = 'date' | 'title' | 'priority' | 'custom'

export interface ViewPrefs {
  groupBy: GroupBy
  sortBy: SortBy
}
