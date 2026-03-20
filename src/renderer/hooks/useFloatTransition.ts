import { useState, useEffect, useRef } from 'react'

const RESIZE_SETTLE_FRAMES = 4
const RESIZE_SETTLE_MAX_MS = 120
const EXIT_DURATION_MS = 150

export function useFloatTransition(shouldOpen: boolean): { mounted: boolean; visible: boolean } {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const seqRef = useRef(0)

  useEffect(() => {
    const seq = ++seqRef.current

    if (shouldOpen) {
      setMounted(true)
      setVisible(false)

      let settled = false
      const reveal = () => {
        if (seq !== seqRef.current || settled) return
        settled = true
        setVisible(true)
      }

      const onResize = () => reveal()
      window.addEventListener('resize', onResize, { once: true })

      let frameCount = 0
      let raf = 0
      const tick = () => {
        if (++frameCount >= RESIZE_SETTLE_FRAMES) { reveal(); return }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)

      const timeout = window.setTimeout(reveal, RESIZE_SETTLE_MAX_MS)

      return () => {
        window.removeEventListener('resize', onResize)
        cancelAnimationFrame(raf)
        clearTimeout(timeout)
      }
    } else {
      setVisible(false)
      const timer = window.setTimeout(() => {
        if (seq !== seqRef.current) return
        setMounted(false)
      }, EXIT_DURATION_MS)
      return () => clearTimeout(timer)
    }
  }, [shouldOpen])

  return { mounted, visible }
}
