import { useState, type DragEvent, type ReactNode } from 'react'
import { motion } from 'motion/react'
import type { Box } from '../lib/jev'
import { BoxOverlay, Scanning } from './ui'
import { ZOOM_SPRING, zoomFor } from '../lib/zoom'

export function Stage({
  src,
  alt,
  box,
  label,
  zoomed,
  scanning,
  dashed,
  tone,
  onDropFile,
  children,
}: {
  src: string
  alt: string
  box: Box | null
  label?: string
  zoomed: boolean
  scanning: boolean
  dashed?: boolean
  tone?: 'accent' | 'hot'
  onDropFile?: (file: File) => void
  children?: ReactNode
}) {
  const [dragging, setDragging] = useState(false)
  const z = zoomFor(zoomed ? box : null)

  const dropProps = onDropFile
    ? {
        onDragOver: (e: DragEvent) => {
          e.preventDefault()
          setDragging(true)
        },
        onDragLeave: () => setDragging(false),
        onDrop: (e: DragEvent) => {
          e.preventDefault()
          setDragging(false)
          const file = e.dataTransfer.files[0]
          if (file) onDropFile(file)
        },
      }
    : {}

  return (
    <div className={dragging ? 'stage dragging' : 'stage'} {...dropProps}>
      <motion.div
        className="stage-inner"
        style={{ originX: 0, originY: 0 }}
        animate={{ scale: z.scale, x: `${z.x * 100}%`, y: `${z.y * 100}%` }}
        transition={ZOOM_SPRING}
      >
        <img src={src} alt={alt} draggable={false} />
      </motion.div>
      {box && (
        <BoxOverlay
          box={{
            left: box.left * z.scale + z.x,
            right: box.right * z.scale + z.x,
            top: box.top * z.scale + z.y,
            bottom: box.bottom * z.scale + z.y,
          }}
          label={label}
          dashed={dashed}
          tone={tone}
        />
      )}
      {scanning && <Scanning />}
      {children}
    </div>
  )
}
