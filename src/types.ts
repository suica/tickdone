// 优先级取值：0 无 / 1 低 / 3 中 / 5 高
export type Priority = 0 | 1 | 3 | 5

export type RepeatRule =
  | { kind: 'daily'; interval: number }
  | { kind: 'weekly'; interval: number; days?: number[] } // 0=周日
  | { kind: 'weekdays' }
  | { kind: 'monthly'; interval: number }
  | { kind: 'yearly'; interval: number }

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export type TaskStatus = 0 | 2 | -1 // 0 未完成, 2 已完成, -1 已放弃

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
  reminder?: number | null // 提前分钟数；0 = 准时
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
  /** 所属时段，缺省为「其他」 */
  section?: HabitSection
  /** 目标天数（坚持 N 天） */
  goalDays?: number
  /** 打卡频率，缺省为每天 */
  frequency?: HabitFrequency
  /** 提醒时间 HH:mm */
  reminders?: string[]
  /** 鼓励语 */
  encouragement?: string
}

export type HabitSection = 'morning' | 'afternoon' | 'night' | 'other'
export type HabitFrequency =
  | { kind: 'daily' }
  | { kind: 'weekly'; times: number } // 每周 N 天
  | { kind: 'days'; days: number[] } // 每周特定几天，0=周日

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
