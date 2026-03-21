import { useState, useEffect, useRef } from 'react'

const RESIZE_SETTLE_FRAMES = 4
const RESIZE_SETTLE_MAX_MS = 120
const EXIT_DURATION_MS = 150
export const FLOAT_LAYOUT_EVENT = 'oco:float-layout'

export function useFloatTransition(shouldOpen: boolean): { mounted: boolean; visible: boolean; measuring: boolean } {
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)
  const seqRef = useRef(0)

  useEffect(() => {
    const seq = ++seqRef.current

    if (shouldOpen) {
      setMounted(true)
      setVisible(false)

      let layoutRaf = 0
      layoutRaf = requestAnimationFrame(() => {
        if (seq !== seqRef.current) return
        window.dispatchEvent(new Event(FLOAT_LAYOUT_EVENT))
      })

      let settled = false
      const reveal = () => {
        if (seq !== seqRef.current || settled) return
        settled = true
        setVisible(true)
      }

      // Wait for the window resize triggered by FLOAT_LAYOUT_EVENT to
      // settle before revealing.  We wait until a resize event fires
      // (meaning Electron has started resizing) and THEN count settle
      // frames, so we don't reveal during the resize.
      let resizeSeen = false
      const onResize = () => { resizeSeen = true }
      window.addEventListener('resize', onResize)

      let frameCount = 0
      let raf = 0
      const tick = () => {
        frameCount++
        // Only start counting settle frames once the resize has
        // actually begun (or enough frames passed that it won't come).
        if (resizeSeen || frameCount >= 2) {
          if (frameCount >= RESIZE_SETTLE_FRAMES) { reveal(); return }
        }
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)

      const timeout = window.setTimeout(reveal, RESIZE_SETTLE_MAX_MS)

      return () => {
        cancelAnimationFrame(layoutRaf)
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

  return { mounted, visible, measuring: shouldOpen && mounted && !visible }
}
