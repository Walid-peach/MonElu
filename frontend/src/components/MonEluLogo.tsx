type Variant = 'light' | 'dark'

interface MonEluLogoProps {
  size?: number
  variant?: Variant
  hideWordmark?: boolean
}

// 7 segments per ring — 3 navy left · 1 gray center · 3 red right
const ANGLES = [180, 210, 240, 270, 300, 330, 360] as const

// 3 concentric rings, outer → inner — equal spacing (12 units center-to-center)
// w = tangential (wider) · h = radial (thinner) → landscape/horizontal pills
const RINGS = [
  { r: 52, w: 17, h: 6, rx: 3 },
  { r: 40, w: 13, h: 6, rx: 3 },
  { r: 28, w: 9,  h: 6, rx: 3 },
] as const

function segColor(deg: number, navy: string, gray: string, red: string): string {
  if (deg <= 240) return navy   // 180 · 210 · 240
  if (deg === 270) return gray  // 270
  return red                     // 300 · 330 · 360
}

// ViewBox 130 × 88 — arc center at cx=65 cy=72
const CX = 65
const CY = 72

export function MonEluLogo({ size = 28, variant = 'light', hideWordmark = false }: MonEluLogoProps) {
  const navy = variant === 'light' ? '#0D1F3C' : '#FFFFFF'
  const gray = variant === 'light' ? '#C8C5C0' : 'rgba(255,255,255,0.4)'
  const red  = '#C9302C'

  return (
    <div className="flex items-center" style={{ gap: Math.round(size * 0.3) }}>
      <svg
        width={size}
        height={Math.round(size * 88 / 130)}
        viewBox="0 0 130 88"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {RINGS.map((ring, ri) =>
          ANGLES.map((deg, si) => {
            const rad = (deg * Math.PI) / 180
            const x   = CX + ring.r * Math.cos(rad)
            const y   = CY + ring.r * Math.sin(rad)
            return (
              <rect
                key={`${ri}-${si}`}
                x={x - ring.w / 2}
                y={y - ring.h / 2}
                width={ring.w}
                height={ring.h}
                rx={ring.rx}
                fill={segColor(deg, navy, gray, red)}
                transform={`rotate(${deg - 90},${x},${y})`}
              />
            )
          })
        )}
        {/* Deputy at the podium */}
        <circle cx={CX} cy={59.8} r={7.5} fill={navy} />
        <rect x={56.5} y={67.3} width={17} height={13} rx={3} fill={navy} />
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
