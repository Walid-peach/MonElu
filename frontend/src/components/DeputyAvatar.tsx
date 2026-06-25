'use client'
import { useState } from 'react'
import Image from 'next/image'
import { getInitials } from '@/lib/utils'

type Props = {
  name: string
  photoUrl: string | null
  size?: 'sm' | 'lg' | 'xl' | '2xl'
  priority?: boolean
}

const sizes = {
  sm:  { w: 40,  h: 40,  className: 'w-10 h-10 text-sm',  rounded: 'rounded-full' },
  lg:  { w: 64,  h: 64,  className: 'w-16 h-16 text-xl',  rounded: 'rounded-full' },
  xl:  { w: 80,  h: 80,  className: 'w-20 h-20 text-2xl', rounded: 'rounded-full' },
  '2xl': { w: 210, h: 262, className: 'text-4xl',           rounded: 'rounded-[14px]' },
}

export function DeputyAvatar({ name, photoUrl, size = 'sm', priority = false }: Props) {
  const [imgError, setImgError] = useState(false)
  const { w, h, className, rounded } = sizes[size]
  const style = size === '2xl' ? { width: 210, height: 262, flexShrink: 0 } : undefined

  if (photoUrl && !imgError) {
    return (
      <div
        className={`${className} ${rounded} overflow-hidden flex-shrink-0 bg-navy-muted`}
        style={style}
      >
        <Image
          src={photoUrl}
          alt={name}
          width={w}
          height={h}
          className="object-cover object-top w-full h-full"
          priority={priority}
          onError={() => setImgError(true)}
        />
      </div>
    )
  }

  return (
    <div
      className={`${className} ${rounded} bg-navy-muted flex items-center justify-center text-navy font-medium flex-shrink-0`}
      style={style}
    >
      {getInitials(name)}
    </div>
  )
}
