import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { I18nProvider } from '../../i18n/index.jsx'
import { ErrorMessage } from './Feedback.jsx'

afterEach(() => { cleanup(); window.localStorage.clear() })

describe('error language', () => {
  it('does not display untranslated server errors in Vietnamese', () => {
    window.localStorage.setItem('cl.lang', 'vi')
    render(<I18nProvider><ErrorMessage error={{ code: 'unrecognized_code', message: 'Server message', fields: { title: 'required', unknown: 'untranslated server detail' } }} /></I18nProvider>)
    expect(screen.getByText('Đã có lỗi xảy ra. Vui lòng thử lại.')).toBeTruthy()
    expect(screen.getByText('Tiêu đề')).toBeTruthy()
    expect(screen.queryByText(/Server message|untranslated server detail/)).toBeNull()
  })
})
