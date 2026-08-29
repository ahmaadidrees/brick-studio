/**
 * Hand-drawn isometric SVG art for the landing page.
 *
 * Everything here is flat-shaded vector geometry in the same toy-brick
 * language as PartThumbnail — no images, no fonts, no 3D bundles. All art is
 * decorative and rendered `aria-hidden`; the copy beside it carries meaning.
 */

const ISO_X = 0.866
const ISO_Y = 0.5

/** Projects grid space (x right-down, z left-down, y up) to SVG screen space. */
function point(x: number, y: number, z: number, scale: number): [number, number] {
  return [(x - z) * ISO_X * scale, (x + z) * ISO_Y * scale - y * scale]
}

function polygon(coords: Array<[number, number]>): string {
  return coords.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
}

/** Mixes a hex color toward white (positive) or black (negative). */
function shade(hex: string, amount: number): string {
  const value = hex.replace('#', '')
  const channels = [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16))
  const target = amount >= 0 ? 255 : 0
  const mix = Math.abs(amount)
  const [r, g, b] = channels.map((channel) => Math.round(channel + (target - channel) * mix))
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`
}

const EDGE = 'rgba(31, 62, 84, 0.2)'

type IsoBoxProps = {
  x: number
  z: number
  /** Bottom of the box, in stud units above the ground plane. */
  y: number
  w: number
  d: number
  h: number
  color: string
  studs?: boolean
  scale: number
}

/** One shaded brick box: top and the two camera-facing sides, plus optional studs. */
export function IsoBox({ x, z, y, w, d, h, color, studs = true, scale }: IsoBoxProps) {
  const x1 = x + w
  const z1 = z + d
  const y1 = y + h
  const top = polygon([point(x, y1, z, scale), point(x1, y1, z, scale), point(x1, y1, z1, scale), point(x, y1, z1, scale)])
  const right = polygon([point(x1, y1, z, scale), point(x1, y1, z1, scale), point(x1, y, z1, scale), point(x1, y, z, scale)])
  const left = polygon([point(x1, y1, z1, scale), point(x, y1, z1, scale), point(x, y, z1, scale), point(x1, y, z1, scale)])

  const studShapes: Array<{ cx: number; cy: number }> = []
  if (studs) {
    for (let i = 0; i < w; i += 1) {
      for (let k = 0; k < d; k += 1) {
        const [cx, cy] = point(x + i + 0.5, y1, z + k + 0.5, scale)
        studShapes.push({ cx, cy })
      }
    }
  }
  const studRx = 0.3 * Math.SQRT2 * ISO_X * scale
  const studRy = 0.3 * Math.SQRT2 * ISO_Y * scale
  const studLift = 0.16 * scale

  return (
    <g>
      <polygon points={left} fill={shade(color, -0.3)} stroke={EDGE} strokeWidth="0.6" strokeLinejoin="round" />
      <polygon points={right} fill={shade(color, -0.12)} stroke={EDGE} strokeWidth="0.6" strokeLinejoin="round" />
      <polygon points={top} fill={shade(color, 0.2)} stroke={EDGE} strokeWidth="0.6" strokeLinejoin="round" />
      {studShapes.map(({ cx, cy }, index) => (
        <g key={index}>
          <ellipse cx={cx} cy={cy - studLift / 2} rx={studRx} ry={studRy + studLift / 2} fill={shade(color, 0.02)} />
          <ellipse cx={cx} cy={cy - studLift} rx={studRx} ry={studRy} fill={shade(color, 0.32)} />
        </g>
      ))}
    </g>
  )
}

/** The studio's block explorer: boxy legs, torso, and a smiling head. */
function IsoCharacter({ x, z, scale }: { x: number; z: number; scale: number }) {
  const skin = '#f0be54'
  const shirt = '#3e83d7'
  const legs = '#305f91'
  const faceAnchor = (fy: number, fz: number) => point(x + 1.02, fy, z + fz, scale)
  const [leftEyeX, leftEyeY] = faceAnchor(2.62, 0.32)
  const [rightEyeX, rightEyeY] = faceAnchor(2.62, 0.7)
  const [smileX, smileY] = faceAnchor(2.3, 0.51)

  return (
    <g>
      <IsoBox x={x} z={z} y={0} w={1} d={1} h={0.9} color={legs} studs={false} scale={scale} />
      <IsoBox x={x - 0.08} z={z - 0.08} y={0.9} w={1.16} d={1.16} h={1.05} color={shirt} studs={false} scale={scale} />
      <IsoBox x={x + 0.06} z={z + 0.06} y={1.95} w={0.88} d={0.88} h={0.85} color={skin} studs={false} scale={scale} />
      <IsoBox x={x + 0.3} z={z + 0.3} y={2.8} w={0.4} d={0.4} h={0.14} color={skin} studs={false} scale={scale} />
      <circle cx={leftEyeX} cy={leftEyeY} r={scale * 0.055} fill="#294650" />
      <circle cx={rightEyeX} cy={rightEyeY} r={scale * 0.055} fill="#294650" />
      <path
        d={`M ${smileX - scale * 0.11} ${smileY} Q ${smileX} ${smileY + scale * 0.12} ${smileX + scale * 0.11} ${smileY}`}
        fill="none"
        stroke="#294650"
        strokeWidth={scale * 0.05}
        strokeLinecap="round"
      />
    </g>
  )
}

function IsoFlag({ x, z, y, scale }: { x: number; z: number; y: number; scale: number }) {
  const [baseX, baseY] = point(x, y, z, scale)
  const [tipX, tipY] = point(x, y + 1.9, z, scale)
  const [wave1X, wave1Y] = point(x + 1.05, y + 1.62, z - 0.1, scale)
  const [wave2X, wave2Y] = point(x + 1.05, y + 1.2, z - 0.1, scale)
  const [footX, footY] = point(x, y + 1.32, z, scale)
  return (
    <g>
      <line x1={baseX} y1={baseY} x2={tipX} y2={tipY} stroke="#4a5b63" strokeWidth={scale * 0.1} strokeLinecap="round" />
      <path
        d={`M ${tipX} ${tipY} Q ${wave1X} ${wave1Y - scale * 0.3} ${wave1X} ${wave1Y} Q ${wave2X} ${wave2Y} ${footX} ${footY} Z`}
        fill="#e2574c"
        stroke={EDGE}
        strokeWidth="0.6"
      />
      <circle cx={tipX} cy={tipY - scale * 0.1} r={scale * 0.11} fill="#f0be54" />
    </g>
  )
}

function Sparkle({ x, y, size, className }: { x: number; y: number; size: number; className?: string }) {
  const d = `M ${x} ${y - size} Q ${x + size * 0.18} ${y - size * 0.18} ${x + size} ${y} Q ${x + size * 0.18} ${y + size * 0.18} ${x} ${y + size} Q ${x - size * 0.18} ${y + size * 0.18} ${x - size} ${y} Q ${x - size * 0.18} ${y - size * 0.18} ${x} ${y - size} Z`
  return <path d={d} fill="#f0be54" opacity="0.9" className={className} />
}

/**
 * The hero diorama: a floating baseplate world mid-build — stacked bricks,
 * a planted flag, the block explorer, and a few bricks still drifting in.
 */
export function HeroDiorama() {
  const s = 30
  return (
    <svg
      className="landing-hero-art"
      viewBox="-250 -205 500 420"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="0" cy="172" rx="196" ry="34" fill="rgba(47, 76, 92, 0.12)" />
      <g transform="translate(0, 40)">
        {/* Baseplate */}
        <IsoBox x={-3.5} z={-3.5} y={-0.5} w={7} d={7} h={0.5} color="#dfe0d0" scale={s} />
        {/* Back wall with window gap */}
        <IsoBox x={-3} z={-3} y={0} w={4} d={1} h={1.2} color="#e2574c" scale={s} />
        <IsoBox x={-3} z={-3} y={1.2} w={2} d={1} h={1.2} color="#e2574c" scale={s} />
        <IsoBox x={-3} z={-3} y={2.4} w={4} d={1} h={1.2} color="#f0be54" scale={s} />
        {/* Side steps */}
        <IsoBox x={-3} z={-1.6} y={0} w={1} d={2} h={1.2} color="#31a06c" scale={s} />
        <IsoBox x={-3} z={0.6} y={0} w={1} d={2} h={2.4} color="#31a06c" scale={s} />
        {/* Tower with flag */}
        <IsoBox x={1.4} z={-2.9} y={0} w={2} d={2} h={3.6} color="#3e83d7" scale={s} />
        <IsoBox x={1.65} z={-2.65} y={3.6} w={1.5} d={1.5} h={0.5} color="#8d6bd9" scale={s} />
        <IsoFlag x={2.4} z={-1.9} y={4.1} scale={s} />
        {/* Loose bricks on the plate */}
        <IsoBox x={-1.4} z={2.1} y={0} w={2} d={1} h={1.2} color="#1fa3b8" scale={s} />
        <IsoBox x={2.1} z={1.4} y={0} w={1} d={1} h={1.2} color="#f0be54" scale={s} />
        {/* The explorer, out on the open plate so they read at a glance */}
        <IsoCharacter x={0.4} z={0.55} scale={s} />
      </g>
      {/* Bricks drifting in to be placed. Positioning lives on SVG transform
          attributes (broad support); CSS only animates the inner group. */}
      <g transform="translate(-186, -120)">
        <g className="landing-drift landing-drift-a">
          <IsoBox x={0} z={0} y={0} w={2} d={1} h={1.2} color="#e2574c" scale={22} />
        </g>
      </g>
      <g transform="translate(172, -142)">
        <g className="landing-drift landing-drift-b">
          <IsoBox x={0} z={0} y={0} w={1} d={1} h={1.2} color="#31a06c" scale={19} />
        </g>
      </g>
      <g transform="translate(148, 96)">
        <g className="landing-drift landing-drift-c">
          <IsoBox x={0} z={0} y={0} w={2} d={2} h={0.5} color="#8d6bd9" scale={17} />
        </g>
      </g>
      <Sparkle x={-176} y={-108} size={9} className="landing-twinkle landing-twinkle-a" />
      <Sparkle x={186} y={-52} size={7} className="landing-twinkle landing-twinkle-b" />
      <Sparkle x={128} y={-158} size={11} className="landing-twinkle landing-twinkle-c" />
    </svg>
  )
}

/** Small 2×2 brick used as the wordmark's logo. */
export function BrickMark({ size = 30 }: { size?: number }) {
  return (
    <svg
      viewBox="-30 -26 60 52"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(0, 6)">
        <IsoBox x={-1} z={-1} y={0} w={2} d={2} h={1.2} color="#3e83d7" scale={14} />
      </g>
    </svg>
  )
}
