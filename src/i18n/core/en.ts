// Shared, non-component text: due dates, repeat and reminder labels, the store's undo toasts, first-run data and the
// focus timer's title and notifications. English is the source: add keys here first, then to every other locale in this folder.
export default {
  // a due date with a time, e.g. "Dec 1, 9:30 AM"
  'core.date.withTime': '{date}, {time}',

  // repeat rules
  'core.repeat.none': 'None',
  'core.repeat.daily': 'Daily',
  'core.repeat.everyNDays': { one: 'Every {count} day', other: 'Every {count} days' },
  'core.repeat.weekdays': 'Every weekday (Mon–Fri)',
  'core.repeat.weekly': 'Weekly',
  'core.repeat.weeklyOn': 'Weekly on {days}',
  'core.repeat.daySeparator': ', ',
  'core.repeat.everyNWeeks': { one: 'Every {count} week', other: 'Every {count} weeks' },
  'core.repeat.monthly': 'Monthly',
  'core.repeat.everyNMonths': { one: 'Every {count} month', other: 'Every {count} months' },
  'core.repeat.yearly': 'Yearly',
  'core.repeat.everyNYears': { one: 'Every {count} year', other: 'Every {count} years' },

  // reminders
  'core.reminder.none': 'None',
  'core.reminder.onTime': 'On time',
  'core.reminder.minutesBefore': { one: '{count} minute before', other: '{count} minutes before' },
  'core.reminder.hoursBefore': { one: '{count} hour before', other: '{count} hours before' },
  'core.reminder.daysBefore': { one: '{count} day before', other: '{count} days before' },

  // undo toasts
  'core.toast.completed': 'Completed “{title}”',
  'core.toast.completedNext': 'Completed. Next: {date}',
  'core.toast.wontDo': "Marked as won't do",
  'core.toast.deletedForever': 'Deleted forever',
  'core.toast.deleted': 'Deleted. You can restore it from Trash',
  'core.toast.listDeleted': 'List deleted',
  'core.toast.tagDeleted': 'Tag deleted',

  // first-run data
  'core.seed.list.work': 'Work',
  'core.seed.list.personal': 'Personal',
  'core.seed.tag.important': 'Important',
  'core.seed.tag.reading': 'Reading',
  'core.seed.habit.wakeUpEarly': 'Wake up early',
  'core.seed.habit.drinkWater': 'Drink water',
  'core.seed.habit.read': 'Read',
  'core.seed.task.welcome': 'Welcome to TickDone 👋',
  'core.seed.task.welcomeNote': 'Click a task to open its details, where you can edit the date, priority, subtasks and description.',
  // must be quick-add syntax the parser understands in this language (src/quickParse.ts); {tag} is the "Important" tag
  'core.seed.quickAddExample': 'Team meeting tomorrow 3pm !high #{tag}',
  'core.seed.task.quickAdd': 'Try quick add: type “{example}” in the input box',
  'core.seed.task.weeklyPlan': 'Plan this week’s work',
  'core.seed.subtask.reviewLastWeek': 'Review last week’s progress',
  'core.seed.subtask.listPriorities': 'List this week’s priorities',
  'core.seed.task.readBook': 'Finish chapter 3 of my book',
  'core.seed.task.groceries': 'Buy groceries',

  // focus timer: tab title and notifications
  'core.pomo.phase.focus': 'Focus',
  'core.pomo.phase.break': 'Break',
  'core.pomo.phase.stopwatch': 'Stopwatch',
  'core.pomo.title': '{time} · {phase}',
  'core.pomo.titlePaused': '{time} (paused) · {phase}',
  'core.pomo.focusDone.title': 'Focus session complete 🍅',
  'core.pomo.focusDone.body': { one: 'Pomodoro done. Take a {count}-minute break.', other: 'Pomodoro done. Take a {count}-minute break.' },
  'core.pomo.focusDone.bodyTask': {
    one: 'Pomodoro done for “{task}”. Take a {count}-minute break.',
    other: 'Pomodoro done for “{task}”. Take a {count}-minute break.',
  },
  'core.pomo.breakDone.title': 'Break is over',
  'core.pomo.breakDone.body': 'Ready for the next pomodoro?',
  'core.toast.filterDeleted': 'Filter deleted',
} as const
