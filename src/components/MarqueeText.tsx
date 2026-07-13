import { useRef, useState, useEffect } from 'react'

// ── MarqueeText — overflowing text that scrolls left on hover to reveal full content
export function MarqueeText({ name, spanStyle }: { name: string; spanStyle?: React.CSSProperties }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLSpanElement>(null)
  const [scrollAmt, setScrollAmt] = useState(0)
  const [hovered, setHovered] = useState(false)

  // ── Measure overflow on mount/name change and watch for container resize ───
  useEffect(() => {
    const measure = () => {
      const outer = outerRef.current
      const inner = innerRef.current
      if (!outer || !inner) return
      setScrollAmt(Math.max(0, inner.scrollWidth - outer.clientWidth))
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (outerRef.current) ro.observe(outerRef.current)
    return () => ro.disconnect()
  }, [name])

  const duration = Math.max(1.5, scrollAmt / 40)

  return (
    <div
      ref={outerRef}
      style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span
        ref={innerRef}
        style={{
          display: 'inline-block',
          whiteSpace: 'nowrap',
          transition: hovered && scrollAmt > 0
            ? `transform ${duration}s 0.5s linear`
            : 'transform 0.2s ease',
          transform: hovered && scrollAmt > 0 ? `translateX(-${scrollAmt}px)` : 'translateX(0)',
          ...spanStyle,
        }}
      >
        {name}
      </span>
    </div>
  )
}
