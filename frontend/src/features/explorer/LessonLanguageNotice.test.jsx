import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { I18nProvider, useT } from '../../i18n/index.jsx'
import LessonLanguageNotice from './LessonLanguageNotice.jsx'

function SwitchLanguage() {
  const { setLang } = useT()
  return <button onClick={() => setLang('vi')}>VI</button>
}

afterEach(cleanup)

describe('lesson language notice', () => {
  it('explains a different author language and updates when the interface language changes', () => {
    window.localStorage.setItem('cl.lang', 'en')
    render(<I18nProvider><SwitchLanguage /><LessonLanguageNotice language="vi" /></I18nProvider>)
    expect(screen.getByText(/lesson content is in Vietnamese/)).toBeTruthy()
    fireEvent.click(screen.getByText('VI'))
    expect(screen.queryByText(/lesson content is in Vietnamese/)).toBeNull()
    expect(screen.queryByText(/Nội dung bài học dùng tiếng Việt/)).toBeNull()
  })

  it('explains an English lesson in Vietnamese and ignores unknown languages', () => {
    window.localStorage.setItem('cl.lang', 'vi')
    const { rerender } = render(<I18nProvider><LessonLanguageNotice language="en" /></I18nProvider>)
    expect(screen.getByText(/Nội dung bài học dùng tiếng Anh/)).toBeTruthy()
    rerender(<I18nProvider><LessonLanguageNotice language={null} /></I18nProvider>)
    expect(screen.queryByText(/Nội dung bài học dùng tiếng Anh/)).toBeNull()
  })
})
