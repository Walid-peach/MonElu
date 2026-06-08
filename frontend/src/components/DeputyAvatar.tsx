'use client'
import { useState } from 'react'
import Image from 'next/image'
import { getInitials } from '@/lib/utils'

type Props = {
  name: string
  photoUrl: string | null
  size?: 'sm' | 'lg'
  priority?: boolean
}

const sizes = {
  sm: { px: 40, className: 'w-10 h-10 text-sm' },
  lg: { px: 64, className: 'w-16 h-16 text-xl' },
}

export function DeputyAvatar({ name, photoUrl, size = 'sm', priority = false }: Props) {
  const [imgError, setImgError] = useState(false)
  const { px, className } = sizes[size]

  if (photoUrl && !imgError) {
    return (
      <div className={`${className} rounded-full overflow-hidden flex-shrink-0 bg-navy-muted`}>
        <Image
          src={photoUrl}
          alt={name}
          width={px}
          height={px}
          className="object-cover object-top w-full h-full"
          priority={priority}
          onError={() => setImgError(true)}
        />
      </div>
    )
  }

  return (
    <div className={`${className} rounded-full bg-navy-muted flex items-center justify-center text-navy font-medium flex-shrink-0`}>
      {getInitials(name)}
    </div>
  )
}
