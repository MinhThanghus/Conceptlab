import { describe, expect, it } from 'vitest'
import {
  ALL_SUBJECTS,
  draftForSpace,
  goalsFor,
  gradesFor,
  labCreateBody,
  subjectsFor,
  validateLabDraft,
} from './labOptions.js'

describe('lab options', () => {
  it('filters subjects by space (School2Lab includes PE, Paper2Explorer does not)', () => {
    expect(subjectsFor('school2lab')).toContain('pe')
    expect(subjectsFor('paper2explorer')).not.toContain('pe')
    expect(subjectsFor('paper2explorer')).toContain('computer_science')
    expect(subjectsFor('')).toEqual(ALL_SUBJECTS)
  })

  it('uses grades 6–12 for School2Lab and university for Paper2Explorer', () => {
    expect(gradesFor('school2lab')).toEqual(['6', '7', '8', '9', '10', '11', '12'])
    expect(gradesFor('paper2explorer')).toEqual(['university'])
    expect(goalsFor('paper2explorer')).toEqual(['explore_paper'])
    expect(goalsFor('school2lab')).toHaveLength(4)
  })

  it('resets choices that do not exist in the new space', () => {
    const school = { title: 'Con lắc', subject: 'pe', grade: '10', goal: 'practice' }
    const paper = draftForSpace('paper2explorer', school)
    expect(paper).toMatchObject({ space: 'paper2explorer', subject: '', grade: 'university', goal: 'explore_paper', title: 'Con lắc' })
    const back = draftForSpace('school2lab', { ...paper, subject: 'physics' })
    expect(back).toMatchObject({ subject: 'physics', grade: '', goal: 'understand_process' })
  })

  it('validates required fields', () => {
    expect(validateLabDraft({ space: 'school2lab', title: ' ', subject: '', grade: '' })).toEqual({
      title: 'titleRequired',
      subject: 'subjectRequired',
      grade: 'gradeRequired',
    })
    expect(validateLabDraft({ space: 'school2lab', title: 'Con lắc đơn', subject: 'physics', grade: '10' })).toEqual({})
    expect(validateLabDraft({ space: 'school2lab', title: 'x'.repeat(161), subject: 'physics', grade: '10' }).title).toBe('titleTooLong')
  })

  it('builds a LabCreate body', () => {
    const body = labCreateBody({
      space: 'paper2explorer',
      title: '  Attention  ',
      subject: 'computer_science',
      grade: 'university',
      topic: '',
      language: 'en',
      goal: 'view_graph',
      level: 'detailed',
      ai_mode: 'standard',
    })
    expect(body).toEqual({
      space: 'paper2explorer',
      title: 'Attention',
      subject: 'computer_science',
      grade: 'university',
      topic: null,
      language: 'en',
      goal: 'explore_paper',
      level: 'detailed',
      ai_mode: 'standard',
    })
  })
})
