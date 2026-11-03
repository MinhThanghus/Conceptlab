/**
 * Choices for creating/filtering labs. Must stay within the backend enums in
 * backend/app/schemas/api.py (Space, Subject, Grade, Goal, Level, AIMode).
 */
import {
  Atom,
  BookOpen,
  Calculator,
  ChartLine,
  Code2,
  Cpu,
  Dna,
  Earth,
  FlaskConical,
  Leaf,
  Settings,
  Volleyball,
} from 'lucide-react'

export const SPACES = ['school2lab', 'paper2explorer']

export const SCHOOL_SUBJECTS = ['math', 'physics', 'chemistry', 'biology', 'geography', 'environment', 'informatics', 'pe', 'other']
export const PAPER_SUBJECTS = ['computer_science', 'physics', 'chemistry', 'math', 'biology', 'agriculture', 'engineering', 'economics', 'other']
export const ALL_SUBJECTS = [
  'math',
  'physics',
  'chemistry',
  'biology',
  'agriculture',
  'geography',
  'environment',
  'informatics',
  'pe',
  'computer_science',
  'engineering',
  'economics',
  'other',
]

export const SECONDARY_GRADES = ['6', '7', '8', '9']
export const HIGH_GRADES = ['10', '11', '12']
export const SCHOOL_GRADES = [...SECONDARY_GRADES, ...HIGH_GRADES]
export const ALL_GRADES = [...SCHOOL_GRADES, 'university']

export const SCHOOL_GOALS = ['understand_process', 'view_graph', 'practice', 'answer_questions']
export const PAPER_GOALS = ['explore_paper']
export const LEVELS = ['simple', 'detailed']
export const AI_MODES = ['contributor', 'standard']

export const SUBJECT_ICONS = {
  math: Calculator,
  physics: Atom,
  chemistry: FlaskConical,
  biology: Dna,
  agriculture: Leaf,
  geography: Earth,
  environment: Leaf,
  informatics: Cpu,
  pe: Volleyball,
  computer_science: Code2,
  engineering: Settings,
  economics: ChartLine,
  other: BookOpen,
}

export function subjectsFor(space) {
  if (space === 'school2lab') return SCHOOL_SUBJECTS
  if (space === 'paper2explorer') return PAPER_SUBJECTS
  return ALL_SUBJECTS
}

export function gradesFor(space) {
  if (space === 'school2lab') return SCHOOL_GRADES
  if (space === 'paper2explorer') return ['university']
  return ALL_GRADES
}

export function goalsFor(space) {
  return space === 'paper2explorer' ? PAPER_GOALS : SCHOOL_GOALS
}

export function subjectIcon(subject) {
  return SUBJECT_ICONS[subject] || BookOpen
}

/** CSS colour expression for a subject (token defined in styles/tokens.css). */
export function subjectColor(subject) {
  return `var(--cl-subj-${ALL_SUBJECTS.includes(subject) ? subject : 'other'})`
}

/**
 * Defaults for the "new lab" form when a space is chosen. Keeps choices that are still
 * valid for the new space and resets the ones that are not.
 */
export function draftForSpace(space, previous = {}) {
  const subjects = subjectsFor(space)
  const grades = gradesFor(space)
  const goals = goalsFor(space)
  return {
    ...previous,
    space,
    subject: subjects.includes(previous.subject) ? previous.subject : '',
    grade: space === 'paper2explorer' ? 'university' : grades.includes(previous.grade) ? previous.grade : '',
    goal: goals.includes(previous.goal) ? previous.goal : goals[0],
  }
}

/** Client-side checks mirroring LabCreate. Returns { field: errorKey }. */
export function validateLabDraft(draft) {
  const errors = {}
  const title = (draft.title || '').trim()
  if (!SPACES.includes(draft.space)) errors.space = 'space'
  if (!title) errors.title = 'titleRequired'
  else if (title.length > 160) errors.title = 'titleTooLong'
  if (!subjectsFor(draft.space).includes(draft.subject)) errors.subject = 'subjectRequired'
  if (!gradesFor(draft.space).includes(draft.grade)) errors.grade = 'gradeRequired'
  if ((draft.topic || '').trim().length > 200) errors.topic = 'topicTooLong'
  return errors
}

/** Body for POST /api/labs (LabCreate). */
export function labCreateBody(draft) {
  const topic = (draft.topic || '').trim()
  return {
    space: draft.space,
    title: draft.title.trim(),
    subject: draft.subject,
    grade: draft.grade,
    topic: topic || null,
    language: draft.language === 'en' ? 'en' : 'vi',
    goal: goalsFor(draft.space).includes(draft.goal) ? draft.goal : goalsFor(draft.space)[0],
    level: LEVELS.includes(draft.level) ? draft.level : 'simple',
    ai_mode: AI_MODES.includes(draft.ai_mode) ? draft.ai_mode : null,
  }
}
