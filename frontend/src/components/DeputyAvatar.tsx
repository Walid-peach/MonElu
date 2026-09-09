'use client'
import { useState } from 'react'
import Image from 'next/image'
import { getInitials } from '@/lib/utils'
import { portraitSrc } from '@/lib/portraits'

type Props = {
  name: string
  photoUrl: string | null
  size?: 'sm' | 'lg' | 'xl' | '2xl'
  priority?: boolean
  /** Set when the deputy's name is already rendered as visible text next to the
   * avatar, so the image doesn't get announced twice (RGAA 1.1 / WCAG 1.1.1). */
  decorative?: boolean
}

const sizes = {
  sm:  { w: 40,  h: 40,  className: 'w-10 h-10 text-sm',  rounded: 'rounded-full' },
  lg:  { w: 64,  h: 64,  className: 'w-16 h-16 text-xl',  rounded: 'rounded-full' },
  xl:  { w: 80,  h: 80,  className: 'w-20 h-20 text-2xl', rounded: 'rounded-full' },
  '2xl': { w: 210, h: 262, className: 'text-4xl',           rounded: 'rounded-[14px]' },
}

export function DeputyAvatar({ name, photoUrl, size = 'sm', priority = false, decorative = false }: Props) {
  const [imgError, setImgError] = useState(false)
  const { w, h, className, rounded } = sizes[size]
  // Same-origin proxy: one cacheable URL per deputy (MON-198).
  const src = portraitSrc(photoUrl)
  const style = size === '2xl' ? { width: 210, height: 262, flexShrink: 0 } : undefined

  if (src && !imgError) {
    return (
      <div
        className={`${className} ${rounded} overflow-hidden flex-shrink-0 bg-navy-muted dark:bg-white/10`}
        style={style}
      >
        <Image
          src={src}
          alt={decorative ? '' : name}
          width={w}
          height={h}
          className="object-cover object-top w-full h-full"
          priority={priority}
          unoptimized
          onError={() => setImgError(true)}
        />
      </div>
    )
  }

  return (
    <div
      className={`${className} ${rounded} bg-navy-muted dark:bg-white/10 flex items-center justify-center text-navy dark:text-gray-100 font-medium flex-shrink-0`}
      style={style}
    >
      {getInitials(name)}
    </div>
  )
}
