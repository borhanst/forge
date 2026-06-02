import type { SVGProps } from 'react'

/**
 * Forge brand mark — an anvil silhouette drawn as a single geometric form.
 * Sized via the `size` prop (defaults to 16).
 */
export function AnvilMark({ size = 16, glow = false, ...rest }: SVGProps<SVGSVGElement> & { size?: number; glow?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      style={{
        filter: glow ? 'drop-shadow(0 0 6px rgba(255,106,31,0.6))' : undefined,
        ...((rest as { style?: React.CSSProperties }).style ?? {}),
      }}
      {...rest}
    >
      {/* Anvil top */}
      <path
        d="M3.5 10.5h25l-3.2 5.2h-7.3v4.6h2.2v2.4H11.8v-2.4h2.2v-4.6H6.7l-3.2-5.2Z"
        fill="currentColor"
      />
      {/* Anvil base */}
      <path d="M9 23.7h14v3H9z" fill="currentColor" opacity="0.85" />
      {/* Single ember spark */}
      {glow && (
        <circle cx="26" cy="6" r="1.2" fill="#fb923c">
          <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" />
        </circle>
      )}
    </svg>
  )
}

export function HammerMark({ size = 14, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
      <path
        d="M14.2 3.8 20 9.6l-3.5 3.5-2.4-2.4-7 7-2.8 1-1-1 1-2.8 7-7-2.4-2.4 3.3-3.7Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function ChevronMark({ size = 10, direction = 'right', ...rest }: SVGProps<SVGSVGElement> & { size?: number; direction?: 'right' | 'down' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="none"
      style={{
        transform: direction === 'down' ? 'rotate(90deg)' : undefined,
        transition: 'transform 0.18s ease',
      }}
      {...rest}
    >
      <path d="M4 2.5 7.5 6 4 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export function GearMark({ size = 14, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...rest}>
      <path
        d="M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6Zm9 3.8c0-.5-.05-.99-.13-1.47l2.05-1.6-2-3.46-2.42.97a7.4 7.4 0 0 0-2.55-1.48L15.5 2.5h-4l-.45 2.46a7.4 7.4 0 0 0-2.55 1.48l-2.42-.97-2 3.46 2.05 1.6c-.08.48-.13.97-.13 1.47s.05.99.13 1.47l-2.05 1.6 2 3.46 2.42-.97a7.4 7.4 0 0 0 2.55 1.48l.45 2.46h4l.45-2.46a7.4 7.4 0 0 0 2.55-1.48l2.42.97 2-3.46-2.05-1.6c.08-.48.13-.97.13-1.47Z"
        fill="currentColor"
      />
    </svg>
  )
}
