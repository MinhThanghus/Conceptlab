import { useT } from '../../../i18n/index.jsx'
import { useBlockEnv } from '../BlockEnv.jsx'

// These illustrations accompany the four authored CHNWRE reading steps. Do not
// infer scientific figures from arbitrary node positions or reuse them for other papers.
// Every fill and stroke is a token, set by class in flow.css (.fi-*).
export default function FlowIllustration({ nodeId, title }) {
  const { t } = useT()
  const env = useBlockEnv()
  if (env.shareCode !== 'CHNWRE' || env.visualContext?.visual3d !== 'semiconductor_chip' || !['n1', 'n2', 'n3', 'n4'].includes(nodeId)) return null
  const w = (key) => t(`flow.illustration.${key}`)
  return <figure className="flow-illustration">
    {nodeId === 'n2' ? <Complementary w={w} /> : nodeId === 'n4' ? <TruthTable w={w} /> : <svg viewBox="0 0 560 290" role="img" aria-label={title}>
      <rect width="560" height="290" rx="12" className="fi-bg" />
      {nodeId === 'n1' ? <Nanowire w={w} /> : <LogicPath w={w} />}
    </svg>}
    {nodeId === 'n1' ? <ul className="flow-figure-key"><li>S: {w('source')}</li><li>D: {w('drain')}</li><li>G: {w('gate')}</li><li>{w('channel')}</li><li>{w('oxide')}</li></ul>
      : nodeId === 'n3' ? <p className="flow-figure-note">{w('input')}: 1, {w('output')}: 0<br />{w('lowPath')}</p> : null}
    <figcaption>{w('note')}</figcaption>
  </figure>
}

function Label({ x, y, children, anchor = 'start', tone = '', size = 18 }) {
  return <text x={x} y={y} textAnchor={anchor} className={['fi-label', tone].filter(Boolean).join(' ')} fontSize={size} fontWeight="600">{children}</text>
}

function Nanowire({ w }) {
  return <>
    <ellipse cx="252" cy="254" rx="103" ry="17" className="fi-shadow" />
    <path d="M199 228 L265 216 L314 235 L248 250 Z" className="fi-pad-top" />
    <path d="M199 228 V241 L248 263 V250 Z" className="fi-pad-left" /><path d="M248 250 L314 235 V248 L248 263 Z" className="fi-pad-right" />
    <rect x="236" y="62" width="32" height="172" className="fi-wire" /><ellipse cx="252" cy="62" rx="16" ry="6" className="fi-wire-top" />
    <path d="M207 116 C207 137 297 137 297 116 V182 C297 203 207 203 207 182 Z" className="fi-gate" />
    <ellipse cx="252" cy="116" rx="45" ry="15" className="fi-gate-top" /><ellipse cx="252" cy="116" rx="23" ry="8" className="fi-oxide" /><ellipse cx="252" cy="116" rx="16" ry="5" className="fi-wire" />
    <path d="M223 49 L262 42 L286 53 L246 60 Z" className="fi-cap-top" /><path d="M223 49 V64 L246 77 V60 Z" className="fi-cap-left" /><path d="M246 60 L286 53 V68 L246 77 Z" className="fi-cap-right" />
    <g className="fi-leader" fill="none" strokeWidth="1.5"><path d="M281 55 H330 L342 40" /><path d="M293 153 H336" /><path d="M308 239 H335" /><path d="M237 90 H194 L180 72" /><path d="M228 117 H179 L164 143" /></g>
    <Label x="345" y="42">{w('drain')}</Label><Label x="343" y="159">{w('gate')}</Label><Label x="342" y="245">{w('source')}</Label>
    <Label x="177" y="67" anchor="end">{w('channel')}</Label><Label x="166" y="164" anchor="end">{w('oxide')}</Label>
  </>
}

// real text (which switch is on), so screen readers read it as text; only the switch drawings are hidden
function Complementary({ w }) {
  return <div className="flow-switch-figure">
    <p className="flow-figure-note"><strong>{w('common')}: 0</strong></p>
    <div className="flow-switch-pair">{[{ name: 'pMOS', on: true }, { name: 'nMOS', on: false }].map(({ name, on }) => <div className="flow-switch-card" key={name}>
      <strong>{name}</strong>
      <svg viewBox="0 0 220 100" aria-hidden="true"><g className={on ? 'fi-switch is-on' : 'fi-switch'} strokeWidth="6" strokeLinecap="round"><path d="M20 65 H72 M148 65 H200" /><path d={on ? 'M72 65 H148' : 'M72 65 L142 30'} /></g><circle cx="72" cy="65" r="6" className="fi-terminal" strokeWidth="2" /><circle cx="148" cy="65" r="6" className="fi-terminal" strokeWidth="2" /></svg>
      <strong className={on ? 'is-on' : ''}>{on ? w('on') : w('off')}</strong>
    </div>)}</div>
    <p className="flow-figure-note">{w('complementary')}</p>
  </div>
}

function LogicPath({ w }) {
  return <>
    <g fill="none" strokeWidth="6" strokeLinecap="round"><path d="M278 44 V84 M278 118 V145" className="fi-path-off" /><path d="M278 145 V175 M278 209 V248" className="fi-path-on" /><path d="M278 145 H433" className="fi-path-on" /><path d="M73 145 H157 V100 H234 M157 145 V192 H234" className="fi-path-in" /></g>
    <rect x="234" y="84" width="88" height="34" rx="8" className="fi-device-off" /><rect x="234" y="175" width="88" height="34" rx="8" className="fi-device-on" />
    <circle cx="278" cy="145" r="7" className="fi-node" />
    <Label x="278" y="32" anchor="middle">VDD</Label><Label x="278" y="272" anchor="middle">GND</Label>
    <Label x="278" y="107" anchor="middle" size={16}>pMOS</Label><Label x="278" y="198" anchor="middle" size={16}>nMOS</Label>
    <Label x="332" y="107" size={16}>{w('off')}</Label><Label x="332" y="199" size={16}>{w('on')}</Label>
    <Label x="42" y="126">{w('input')}: 1</Label><Label x="410" y="126">{w('output')}: 0</Label>
    <Label x="438" y="182" anchor="middle" size={15} tone="is-on">GND → 0</Label>
  </>
}

function TruthTable({ w }) {
  return <div className="flow-truth-figure">
    <table><caption>{w('truth')}</caption><thead><tr>{[w('inputShort'), 'pMOS', 'nMOS', w('outputShort')].map((text) => <th key={text} scope="col">{text}</th>)}</tr></thead><tbody>
      <tr><td>0</td><td>{w('on')}</td><td>{w('off')}</td><td>1</td></tr>
      <tr><td>1</td><td>{w('off')}</td><td>{w('on')}</td><td>0</td></tr>
    </tbody></table><p className="flow-figure-note">{w('limits')}</p>
  </div>
}
