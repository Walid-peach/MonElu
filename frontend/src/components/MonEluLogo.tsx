export function MonEluLogo({ size = 28 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
        <g transform="translate(24,32)">
          {[...Array(8)].map((_, i) => {
            const angle = -150 + i * (300 / 7)
            const rad = angle * Math.PI / 180
            const x = Math.cos(rad) * 20
            const y = Math.sin(rad) * 20
            const color = i % 3 === 1 ? '#C9302C' : '#0D1F3C'
            return (
              <rect key={i} x={x - 3} y={y - 3} width={6} height={6} rx={1.5}
                fill={color} opacity={0.9}
                transform={`rotate(${angle}, ${x}, ${y})`} />
            )
          })}
          {[...Array(5)].map((_, i) => {
            const angle = -120 + i * (240 / 4)
            const rad = angle * Math.PI / 180
            const x = Math.cos(rad) * 13
            const y = Math.sin(rad) * 13
            const color = i % 2 === 0 ? '#888780' : '#0D1F3C'
            return (
              <rect key={i} x={x - 2.5} y={y - 2.5} width={5} height={5} rx={1}
                fill={color} opacity={0.7}
                transform={`rotate(${angle}, ${x}, ${y})`} />
            )
          })}
          <circle cx={0} cy={-2} r={4} fill="#0D1F3C" />
          <rect x={-5} y={2} width={10} height={6} rx={2} fill="#0D1F3C" />
        </g>
      </svg>
      <span className="font-serif text-xl text-navy leading-none">
        Mon<span className="text-red-civic">Élu</span>
      </span>
    </div>
  )
}
