import type { SVGProps } from 'react'

type LibTvLogoProps = SVGProps<SVGSVGElement> & {
  compact?: boolean
}

/** Geometric local recreation of the LibTV wordmark used by the app shell. */
export function LibTvLogo({ compact = false, ...props }: LibTvLogoProps) {
  return (
    <svg
      viewBox={compact ? '0 0 30 24' : '0 0 88 24'}
      role="img"
      aria-label="LibTV"
      fill="none"
      {...props}
    >
      <path d="M7.4 4h19l-3.2 5.1H10.9L7.4 15H3L7.4 4Z" fill="currentColor" />
      <path d="M9.3 15h12.2l3.2-5.1h4.4L23 20H4l3-4.9h2.3Z" fill="currentColor" />
      {!compact && (
        <g fill="currentColor">
          <path d="M35 5.1h3.7l-2.6 11.4h6.3l-.6 2.8h-10L35 5.1Z" />
          <path d="M45.6 8.6h3.5l-2.4 10.7h-3.5l2.4-10.7Zm.6-3.6h3.5L49 7.7h-3.5l.7-2.7Z" />
          <path d="M53 5.1h3.5l-1 4.5a6 6 0 0 1 3.3-1.2c2.9 0 4.6 2.1 3.9 5.4-.8 3.5-3.3 5.7-6.3 5.7-1.5 0-2.6-.5-3.3-1.5l-.3 1.3h-3.4L53 5.1Zm4.4 6c-1.4 0-2.5 1-2.9 2.7-.4 1.8.3 3 1.8 3s2.5-1.1 2.9-2.9c.4-1.7-.3-2.8-1.8-2.8Z" />
          <path d="M65 5.1h12.9l-.7 3h-4.6L70 19.3h-3.7l2.6-11.2h-4.6l.7-3Z" />
          <path d="M78.5 5.1h3.9l.7 10.1 5-10.1H92l-7.7 14.2h-4.1L78.5 5.1Z" />
        </g>
      )}
    </svg>
  )
}
