type Variant = 'light' | 'dark'

interface MonEluLogoProps {
  size?: number
  variant?: Variant
  hideWordmark?: boolean
}

// 7 angles spanning the upper semicircle (left → top → right)
const ANGLES = [180, 210, 240, 270, 300, 330, 360] as const

// Color assigned by angular position — French tricolor (bleu-blanc-rouge)
function segColor(deg: number, navy: string, gray: string, red: string): string {
  if (deg <= 240) return navy
  if (deg === 270) return gray
  return red
}

export function MonEluLogo({ size = 28, variant = 'light', hideWordmark = false }: MonEluLogoProps) {
  const navy = variant === 'light' ? '#0D1F3C' : '#FFFFFF'
  const gray = variant === 'light' ? '#D2CFCA' : 'rgba(255,255,255,0.45)'
  const red  = '#C9302C'

  const cx = 50
  const cy = 50

  const rings = [
    { r: 40, w: 9,  h: 14, rx: 4.5 },
    { r: 25, w: 6,  h: 10, rx: 3   },
  ]

  return (
    <div className="flex items-center" style={{ gap: Math.round(size * 0.32) }}>
      <svg
        width={size}
        height={Math.round(size * 0.6)}
        viewBox="0 0 100 60"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {rings.map((ring, ri) =>
          ANGLES.map((deg, si) => {
            const rad = (deg * Math.PI) / 180
            const x   = cx + ring.r * Math.cos(rad)
            const y   = cy + ring.r * Math.sin(rad)
            const fill = segColor(deg, navy, gray, red)
            return (
              <rect
                key={`${ri}-${si}`}
                x={x - ring.w / 2}
                y={y - ring.h / 2}
                width={ring.w}
                height={ring.h}
                rx={ring.rx}
                fill={fill}
                transform={`rotate(${deg - 90},${x},${y})`}
              />
            )
          })
        )}
        {/* Deputy at the podium */}
        <circle cx={cx} cy={40} r={4.5} fill={navy} />
        <rect x={42} y={44.5} width={16} height={10} rx={3.5} fill={navy} />
      </svg>

      {!hideWordmark && (
        <span
          className="font-serif leading-none select-none"
          style={{ fontSize: Math.round(size * 0.75), color: navy }}
        >
          Mon<span style={{ color: red }}>Élu</span>
        </span>
      )}
    </div>
  )
}
