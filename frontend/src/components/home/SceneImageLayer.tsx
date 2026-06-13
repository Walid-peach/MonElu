'use client'

import Image from 'next/image'
import { motion, type MotionValue } from 'framer-motion'
import type { ReactNode } from 'react'

type SceneImageLayerProps = {
  src: string
  alt: string
  opacity?: MotionValue<number> | number
  scale?: MotionValue<number> | number
  filter?: MotionValue<string> | string
  priority?: boolean
  objectPosition?: string
  className?: string
  imageClassName?: string
  children?: ReactNode
}

export function SceneImageLayer({
  src,
  alt,
  opacity = 1,
  scale = 1,
  filter,
  priority = false,
  objectPosition = 'center center',
  className = '',
  imageClassName = '',
  children,
}: SceneImageLayerProps) {
  return (
    <motion.div
      className={`absolute inset-0 overflow-hidden ${className}`}
      style={{ opacity, scale, filter }}
    >
      <Image
        src={src}
        alt={alt}
        fill
        priority={priority}
        sizes="100vw"
        className={`object-cover ${imageClassName}`}
        style={{ objectPosition }}
      />
      {children}
    </motion.div>
  )
}
