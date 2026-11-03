import { Check, Pause, Play, SkipBack, SkipForward, StepBack, StepForward } from 'lucide-react'
import { useT } from '../../../i18n/index.jsx'
import { Button, IconButton, RichText, Segmented, TextField } from '../../../components/ui/index.js'

/* Shared pieces of the step-by-step algorithm views (sorting, binary search, compare). */

const SPEEDS = [0.5, 1, 2]

/** Message of a trace frame with numbers in the reader's locale. */
export function useFrameText() {
  const { t, fmt } = useT()
  return (msg) => {
    if (!msg) return ''
    const vars = {}
    for (const [k, v] of Object.entries(msg.vars || {})) vars[k] = typeof v === 'number' ? fmt.number(v, 4) : v
    if (msg.key === 'algorithm.msg.sorted' && typeof msg.vars?.comparisons === 'number') vars.count = msg.vars.comparisons
    return t(msg.key, vars)
  }
}

/** Transport for a trace. `primary` keeps Play the screen's one pear button; a second player (compare) passes false. */
export function StepControls({ player, count, speed, onSpeed, label, primary = true }) {
  const { t, fmt } = useT()
  return (
    <div className="alg-transport" role="group" aria-label={label}>
      <IconButton icon={SkipBack} bordered label={t('algorithm.controls.first')} disabled={player.atStart} onClick={player.first} />
      <IconButton icon={StepBack} bordered label={t('algorithm.controls.prev')} disabled={player.atStart} onClick={player.prev} />
      <Button variant={primary ? 'primary' : undefined} className="alg-play" icon={player.playing ? Pause : Play} disabled={count < 2} onClick={player.playing ? player.pause : player.play}>
        {player.playing ? t('algorithm.controls.pause') : player.atEnd ? t('algorithm.controls.replay') : t('algorithm.controls.play')}
      </Button>
      <IconButton icon={StepForward} bordered label={t('algorithm.controls.next')} disabled={player.atEnd} onClick={player.next} />
      <IconButton icon={SkipForward} bordered label={t('algorithm.controls.last')} disabled={player.atEnd} onClick={player.end} />
      <span className="alg-step-count">{t('algorithm.controls.stepOf', { n: player.index + 1, total: count })}</span>
      <div className="alg-speed">
        <Segmented
          size="sm"
          label={t('algorithm.controls.speed')}
          value={speed}
          onChange={onSpeed}
          options={SPEEDS.map((s) => ({
            value: s,
            label: `${fmt.number(s, 2)}×`,
          }))}
        />
      </div>
    </div>
  )
}

/** Keyboard on the stage: ← → step, Home/End jump, Space plays or pauses. */
export function stageKeys(player) {
  return (e) => {
    const map = {
      ArrowRight: player.next,
      ArrowLeft: player.prev,
      Home: player.first,
      End: player.end,
    }
    if (map[e.key]) {
      e.preventDefault()
      map[e.key]()
    } else if (e.key === ' ' || e.key === 'Enter') {
      if (e.target !== e.currentTarget) return
      e.preventDefault()
      if (player.playing) player.pause()
      else player.play()
    }
  }
}

export function PseudoCode({ lines, current, label }) {
  return (
    <figure className="alg-code">
      <figcaption>{label}</figcaption>
      <pre>
        <code>
          {lines.map((line, i) => (
            <span key={i} className={`alg-line${i === current ? ' current' : ''}`} aria-current={i === current ? 'step' : undefined}>
              <span className="ln" aria-hidden="true">
                {i + 1}
              </span>
              {line}
              {'\n'}
            </span>
          ))}
        </code>
      </pre>
    </figure>
  )
}

export function ExplanationSection({ text }) {
  const { t } = useT()
  if (!text) return null
  return (
    <section className="stack-sm alg-explain">
      <h3 className="ix-heading alg-heading">{t('algorithm.explanationTitle')}</h3>
      <RichText text={text} />
    </section>
  )
}

/** Text field for a number list with Apply on Enter; shows parse problems inline. */
export function ListField({ id, label, hint, text, onText, issue, onApply, dirty }) {
  const { t } = useT()
  return (
    <form
      className="alg-list-form"
      onSubmit={(e) => {
        e.preventDefault()
        onApply()
      }}
    >
      <TextField
        id={id}
        label={label}
        hint={hint}
        value={text}
        maxLength={200}
        spellCheck={false}
        autoComplete="off"
        error={issue ? t(`algorithm.list.${issue.code}`, issue.vars) : undefined}
        onChange={(e) => onText(e.target.value)}
      />
      <Button type="submit" icon={Check} disabled={Boolean(issue) || !dirty}>
        {t('algorithm.list.apply')}
      </Button>
    </form>
  )
}
