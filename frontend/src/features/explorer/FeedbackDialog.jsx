import { useEffect, useId, useRef, useState } from 'react'
import { CircleCheck, Star } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { post } from '../../lib/api.js'
import { Alert, Button, Dialog, ErrorMessage, TextArea } from '../../components/ui/index.js'
import { markFeedbackSent } from './explorerUtils.js'

const RATINGS = [1, 2, 3, 4, 5]

/** Anonymous lesson feedback for the teacher: 1 to 5 stars and an optional comment (POST /api/share/:code/feedback). */
export default function FeedbackDialog({ open, onClose, code, sentBefore }) {
  const { t } = useT()
  const name = useId()
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [status, setStatus] = useState('idle') // idle | sending | sent
  const [error, setError] = useState(null)
  const [missing, setMissing] = useState(false)
  const doneRef = useRef(null)

  // the form is replaced by the thank-you view: keep keyboard focus inside the dialog
  useEffect(() => {
    if (status === 'sent') doneRef.current?.focus()
  }, [status])

  useEffect(() => {
    if (open) {
      setStatus('idle')
      setError(null)
      setMissing(false)
    }
  }, [open])

  const submit = async (event) => {
    event.preventDefault()
    if (!rating) {
      setMissing(true)
      return
    }
    setStatus('sending')
    setError(null)
    try {
      const body = { rating }
      if (comment.trim()) body.comment = comment.trim().slice(0, 1000)
      await post(`/api/share/${code}/feedback`, body)
      markFeedbackSent(code)
      setStatus('sent')
      setRating(0)
      setComment('')
    } catch (err) {
      setError(err)
      setStatus('idle')
    }
  }

  if (status === 'sent') {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={t('explorer.feedback.thanksTitle')}
        footer={
          <Button ref={doneRef} variant="primary" onClick={onClose}>
            {t('common.actions.close')}
          </Button>
        }
      >
        <div className="xp-thanks">
          <p className="xp-thanks-title" role="status">
            <CircleCheck aria-hidden="true" />
            {t('explorer.feedback.thanksBody')}
          </p>
        </div>
      </Dialog>
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('explorer.feedback.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.actions.cancel')}</Button>
          <Button variant="primary" type="submit" form={`${name}-form`} loading={status === 'sending'}>
            {t('explorer.feedback.submit')}
          </Button>
        </>
      }
    >
      <form id={`${name}-form`} className="stack" onSubmit={submit} noValidate>
        {sentBefore ? <Alert tone="info">{t('explorer.feedback.sentBefore')}</Alert> : null}
        <fieldset className="xp-rating" aria-describedby={missing ? `${name}-missing` : undefined}>
          <legend className="field-label">{t('explorer.feedback.ratingLabel')}</legend>
          <div className="xp-stars">
            {RATINGS.map((n) => (
              <label key={n} className={['xp-star', n <= rating && 'on'].filter(Boolean).join(' ')}>
                <input
                  type="radio"
                  className="visually-hidden"
                  name={`${name}-rating`}
                  value={n}
                  checked={rating === n}
                  onChange={() => {
                    setRating(n)
                    setMissing(false)
                  }}
                />
                <span className="xp-star-face" aria-hidden="true">
                  <Star />
                </span>
                <span className="visually-hidden">{t('explorer.feedback.starLabel', { count: n, label: t(`explorer.feedback.stars.s${n}`) })}</span>
              </label>
            ))}
          </div>
          <p className="xp-rating-label" aria-hidden="true">
            {rating ? t(`explorer.feedback.stars.s${rating}`) : t('explorer.feedback.pick')}
          </p>
          {missing ? (
            <p className="field-error" id={`${name}-missing`} role="alert">
              {t('explorer.feedback.ratingRequired')}
            </p>
          ) : null}
        </fieldset>
        <TextArea
          label={t('explorer.feedback.comment')}
          hint={t('explorer.feedback.commentHint')}
          rows={4}
          maxLength={1000}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <p className="xp-feedback-note">{t('explorer.feedback.anonymous')}</p>
        <ErrorMessage error={error} />
      </form>
    </Dialog>
  )
}
