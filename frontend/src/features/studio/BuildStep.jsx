import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ChevronsDownUp, ChevronsUpDown, Eye, Plus, Puzzle, Sparkles } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { Button, EmptyState, LinkButton, useToast } from '../../components/ui/index.js'
import { useLab } from '../lab/LabContext.jsx'
import { blankBlock } from '../lab/specUtils.js'
import { NextStepCard, StepHeader } from './authoring/StepHeader.jsx'
import { BlockCard } from './authoring/build/BlockCard.jsx'
import { AddBlockDialog } from './authoring/build/AddBlockDialog.jsx'
import { GeneratePanel } from './authoring/build/GeneratePanel.jsx'
import { LabInfoEditor } from './authoring/build/LabInfoEditor.jsx'
import './authoring/authoring.css'

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

const HOLD_STOPS = ['wheel', 'touchmove', 'keydown', 'pointerdown']

/**
 * The parts above a linked part may still be loading (each editor is its own chunk, pictures come
 * later) and push it far down after the first scroll. For a few seconds, bring it back to the top
 * whenever its place on the page changes, until the teacher scrolls, taps or types.
 */
function holdInView(card, ms = 4000) {
  if (typeof ResizeObserver === 'undefined') return
  const place = () => card.getBoundingClientRect().top + window.scrollY
  let last = place()
  const observer = new ResizeObserver(() => {
    if (!card.isConnected) return stop()
    const now = place()
    if (Math.abs(now - last) < 2) return
    last = now
    card.scrollIntoView({ block: 'start', behavior: 'auto' })
  })
  const timer = window.setTimeout(stop, ms)
  function stop() {
    observer.disconnect()
    window.clearTimeout(timer)
    HOLD_STOPS.forEach((type) => window.removeEventListener(type, stop, true))
  }
  observer.observe(document.body)
  HOLD_STOPS.forEach((type) => window.addEventListener(type, stop, { capture: true, passive: true }))
}

function focusBlock(id) {
  window.requestAnimationFrame(() => {
    const card = document.getElementById(`block-${id}`)
    const heading = document.getElementById(`block-${id}-title`)
    if (!card) return
    card.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
    heading?.focus({ preventScroll: true })
    holdInView(card)
  })
}

/** Step 4: build the interactive experience (lab info, AI generation, blocks and their editors). */
export default function BuildStep() {
  const { t, fmt } = useT()
  const toast = useToast()
  const location = useLocation()
  const { lab, updateBlock, addBlock, removeBlock, moveBlock } = useLab()
  const blocks = useMemo(() => lab.spec?.blocks || [], [lab.spec])
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [announceText, setAnnounceText] = useState('')
  const listHeadingRef = useRef(null)
  const generateRef = useRef(null)

  const fnRef = useRef(null)
  fnRef.current = { updateBlock, removeBlock, moveBlock }
  const announce = useCallback((text) => {
    setAnnounceText('')
    window.requestAnimationFrame(() => setAnnounceText(text))
  }, [])
  const actions = useMemo(
    () => ({
      update: (id, next) => fnRef.current.updateBlock(id, next),
      setConfirmed: (id, value) => fnRef.current.updateBlock(id, { confirmed: value }),
      move: (id, delta) => {
        fnRef.current.moveBlock(id, delta)
        announce(t('build.blocks.moved'))
      },
      remove: (id) => {
        fnRef.current.removeBlock(id)
        announce(t('build.blocks.removed'))
        window.requestAnimationFrame(() => listHeadingRef.current?.focus())
      },
    }),
    [announce, t],
  )
  const toggle = useCallback(
    (id) =>
      setCollapsed((set) => {
        const next = new Set(set)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      }),
    [],
  )

  // Deep link: /app/labs/:id/build#block-<id>
  useEffect(() => {
    const match = /^#block-(.+)$/.exec(location.hash || '')
    if (!match) return
    const id = decodeURIComponent(match[1])
    setCollapsed((set) => {
      if (!set.has(id)) return set
      const next = new Set(set)
      next.delete(id)
      return next
    })
    focusBlock(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.hash])

  const onAdd = (type) => {
    const block = blankBlock(type, t)
    addBlock(block)
    setAddOpen(false)
    toast.success(t('build.add.added', { type: t(`blocks.types.${type}`) }))
    focusBlock(block.id)
  }

  const onGenerated = useCallback(
    (ids, { late } = {}) => {
      if (ids.length) {
        setCollapsed((set) => {
          const next = new Set(set)
          ids.forEach((id) => next.delete(id))
          return next
        })
        toast.success(late ? t('build.generate.doneLate', { count: ids.length }) : t('build.generate.done', { count: ids.length }))
        if (!late) focusBlock(ids[0])
      } else {
        toast.info(t('build.generate.noneCreated'))
      }
    },
    [t, toast],
  )

  const confirmedCount = blocks.filter((b) => b.confirmed).length
  const aiPending = blocks.filter((b) => b.ai_generated && !b.confirmed).length
  const allCollapsed = blocks.length > 0 && blocks.every((b) => collapsed.has(b.id))

  return (
    <div className="container page au-page">
      <p className="visually-hidden" role="status" aria-live="polite">
        {announceText}
      </p>
      <StepHeader
        step="build"
        title={t('build.step.title')}
        description={t('build.step.desc')}
        actions={
          <>
            <Button icon={Plus} onClick={() => setAddOpen(true)}>
              {t('blocks.addBlock')}
            </Button>
            <LinkButton to={`/app/labs/${lab.id}/preview`} icon={Eye}>
              {t('build.previewLink')}
            </LinkButton>
          </>
        }
      />

      <LabInfoEditor />

      <div ref={generateRef}>
        <GeneratePanel blockCount={blocks.length} onGenerated={onGenerated} />
      </div>

      <section className="stack" aria-labelledby="au-blocks-title">
        <div className="au-blocks-head">
          <div>
            <h3 id="au-blocks-title" ref={listHeadingRef} tabIndex={-1}>
              {t('build.blocks.title', { count: blocks.length })}
            </h3>
            {blocks.length ? (
              <p className="au-muted-line">
                {t('build.blocks.summary', { checked: fmt.number(confirmedCount, 0), total: fmt.number(blocks.length, 0) })}
                {aiPending ? `, ${t('build.blocks.aiPending', { count: aiPending })}` : ''}
              </p>
            ) : null}
          </div>
          {blocks.length ? (
            <div className="row" style={{ gap: '0.5rem' }}>
              <Button
                size="sm"
                variant="ghost"
                icon={allCollapsed ? ChevronsUpDown : ChevronsDownUp}
                onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(blocks.map((b) => b.id)))}
              >
                {allCollapsed ? t('build.blocks.expandAll') : t('build.blocks.collapseAll')}
              </Button>
              <Button size="sm" icon={Plus} onClick={() => setAddOpen(true)}>
                {t('blocks.addBlock')}
              </Button>
            </div>
          ) : null}
        </div>

        {blocks.length ? (
          <ol className="list-reset stack au-block-list">
            {blocks.map((b, i) => (
              <li key={b.id}>
                <BlockCard block={b} index={i} count={blocks.length} collapsed={collapsed.has(b.id)} onToggle={toggle} actions={actions} />
              </li>
            ))}
          </ol>
        ) : (
          <div className="card">
            <EmptyState
              icon={Puzzle}
              title={t('blocks.emptyBlocks')}
              action={
                <div className="row" style={{ justifyContent: 'center' }}>
                  <Button
                    icon={Sparkles}
                    onClick={() => {
                      generateRef.current?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
                      generateRef.current?.querySelector('h3')?.focus?.()
                    }}
                  >
                    {t('build.empty.generate')}
                  </Button>
                  <Button icon={Plus} onClick={() => setAddOpen(true)}>
                    {t('build.empty.manual')}
                  </Button>
                </div>
              }
            >
              <p>{t('build.empty.body')}</p>
            </EmptyState>
          </div>
        )}
      </section>

      <NextStepCard
        to={`/app/labs/${lab.id}/preview`}
        step="preview"
        description={t('build.next.desc')}
        disabled={!blocks.length}
        primary={blocks.length > 0}
        note={blocks.length && confirmedCount < blocks.length ? t('build.next.unchecked', { count: blocks.length - confirmedCount }) : null}
      />

      <AddBlockDialog open={addOpen} onClose={() => setAddOpen(false)} onAdd={onAdd} />
    </div>
  )
}
