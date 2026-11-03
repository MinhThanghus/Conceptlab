import { forwardRef } from 'react'
import { Link } from 'react-router-dom'
import { LoaderCircle } from 'lucide-react'

function classes(variant, size, block, extra) {
  return ['btn', variant && `btn-${variant}`, size && `btn-${size}`, block && 'btn-block', extra].filter(Boolean).join(' ')
}

/**
 * <Button variant="primary|paper|accent|danger|ghost|soft" size="sm|lg" loading icon={Icon}>
 * While `loading`, the button stays focusable but ignores clicks (aria-busy).
 */
export const Button = forwardRef(function Button(
  { variant, size, block, loading = false, icon: Icon, iconEnd: IconEnd, className, children, disabled, onClick, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={classes(variant, size, block, className)}
      disabled={disabled}
      aria-busy={loading || undefined}
      onClick={loading ? (e) => e.preventDefault() : onClick}
      {...rest}
    >
      {loading ? <LoaderCircle className="spin" aria-hidden="true" /> : Icon ? <Icon aria-hidden="true" /> : null}
      {children}
      {IconEnd && !loading ? <IconEnd aria-hidden="true" /> : null}
    </button>
  )
})

/** Router link styled as a button. */
export function LinkButton({ to, variant, size, block, icon: Icon, iconEnd: IconEnd, className, children, ...rest }) {
  return (
    <Link to={to} className={classes(variant, size, block, className)} {...rest}>
      {Icon ? <Icon aria-hidden="true" /> : null}
      {children}
      {IconEnd ? <IconEnd aria-hidden="true" /> : null}
    </Link>
  )
}

/** Icon-only button: `label` is required and becomes the accessible name + tooltip. */
export const IconButton = forwardRef(function IconButton(
  { icon: Icon, label, size, bordered, pressed, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={['icon-btn', size === 'sm' && 'sm', bordered && 'bordered', className].filter(Boolean).join(' ')}
      aria-label={label}
      title={label}
      aria-pressed={pressed === undefined ? undefined : Boolean(pressed)}
      {...rest}
    >
      <Icon aria-hidden="true" />
    </button>
  )
})
