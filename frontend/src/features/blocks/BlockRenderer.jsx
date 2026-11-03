import { Component, Suspense } from 'react'
import { MessageCircleQuestion } from 'lucide-react'
import { useT } from '../../i18n/index.jsx'
import { AIBadge, Alert, InlineText, LoadingBlock } from '../../components/ui/index.js'
import { BLOCK_REGISTRY } from './registry.js'
import { useBlockEnv } from './BlockEnv.jsx'
import { SourceRefChips } from '../sources/SourceRefChips.jsx'
import './blockFrame.css'

class BlockErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }
  static getDerivedStateFromError(error) {
    return { error }
  }
  componentDidCatch(error, info) {
    console.error('Block render error', error, info)
  }
  componentDidUpdate(prev) {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null })
  }
  render() {
    if (this.state.error) return this.props.fallback
    return this.props.children
  }
}

/** Renders one block by type, isolated by an error boundary and code-split. */
export function BlockRenderer({ block, mode = 'view', onChange }) {
  const { t } = useT()
  const entry = BLOCK_REGISTRY[block?.type]
  if (!entry) return <Alert tone="warning">{t('blocks.unsupported')}</Alert>
  const { Component: BlockComponent } = entry
  return (
    <BlockErrorBoundary resetKey={JSON.stringify(block).length} fallback={<Alert tone="danger">{t('blocks.blockError')}</Alert>}>
      <Suspense fallback={<LoadingBlock lines={3} height="12rem" />}>
        <BlockComponent block={block} mode={mode} onChange={onChange} />
      </Suspense>
    </BlockErrorBoundary>
  )
}

/**
 * Standard learner-facing frame, the one containment layer of a part: its title with the kind
 * of part and the AI label as a byline, a description, the content, the part's sources and
 * "Ask AI about this part". Block components may use it for consistent chrome.
 * On a lesson slide (env.presentation 'slides') the deck draws the sheet, the heading and the
 * "Ask AI" tool, and may hide this head: the part then fills the slide (`blk-in-deck`), a block
 * renders its own controls in its body (pass no `actions`), and the AI label moves to the foot so
 * hiding the head never hides it.
 */
export function BlockFrame({ block, children, actions, headingLevel = 2 }) {
  const { t } = useT()
  const env = useBlockEnv()
  const Heading = `h${headingLevel}`
  const kind = t(`blocks.types.${block.type}`)
  const canAsk = env.aiAvailable && env.mode === 'view'
  const showKind = Boolean(block.title)
  const inDeck = env.presentation === 'slides'
  const aiInHead = block.ai_generated && !inDeck
  return (
    <section className={inDeck ? 'card blk blk-in-deck' : 'card blk'} aria-labelledby={`blk-${block.id}`} data-block-id={block.id} data-block-type={block.type}>
      <div className="blk-head">
        <Heading id={`blk-${block.id}`} className="blk-title">
          {block.title || kind}
        </Heading>
        {showKind || aiInHead || actions || canAsk ? (
          <div className="blk-bar">
            {showKind || aiInHead ? (
              <p className="blk-meta">
                {showKind ? <span>{kind}</span> : null}
                {aiInHead ? <AIBadge /> : null}
              </p>
            ) : null}
            {actions || canAsk ? (
              <div className="blk-actions">
                {actions}
                {canAsk ? (
                  <button type="button" className="btn btn-ghost btn-sm blk-ask" onClick={() => env.ask({ block_id: block.id })}>
                    <MessageCircleQuestion aria-hidden="true" />
                    {t('blocks.askAbout')}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {block.description ? <p className="blk-desc"><InlineText text={block.description} /></p> : null}
      {children}
      {block.source_refs?.length && !env.sourcesAtTop ? (
        <div className="blk-sources">
          <SourceRefChips refs={block.source_refs} />
        </div>
      ) : null}
      {block.ai_generated && inDeck ? (
        <p className="blk-deck-note">
          <AIBadge />
        </p>
      ) : null}
    </section>
  )
}
