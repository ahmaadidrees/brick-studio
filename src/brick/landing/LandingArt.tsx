/**
 * Hand-drawn isometric SVG art for the landing page.
 *
 * Everything here is flat-shaded vector geometry in the same toy-brick
 * language as PartThumbnail — no images, no fonts, no 3D bundles. All art is
 * decorative and rendered `aria-hidden`; the copy beside it carries meaning.
 *
 * The vector pieces double as same-size placeholders for the W7 media files
 * (`/brand/media/*`) until those land; `LandingPage` swaps them in behind a
 * `<picture>` that falls back here when a file is missing.
 */

const ISO_X = 0.866
const ISO_Y = 0.5

/* Direction I palette. Local literals on purpose: the art must render the
   same everywhere and never depends on the host stylesheet. */
const BLUE = '#5888DA'
const BLUE_DEEP = '#3565BF'
const CORAL = '#F17861'
const BUTTER = '#F3CA74'
const INK = '#263C51'
const PLATE = '#E4E0D3'
const GREEN = '#5FAF7A'
const ORCHID = '#9C7BD6'

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

const EDGE = 'rgba(38, 60, 81, 0.2)'

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

/** A boxy explorer: legs, torso, and a smiling head. Colors are overridable so rosters read as different people. */
function IsoCharacter({ x, z, scale, shirt = BLUE, skin = BUTTER, legs = BLUE_DEEP }: { x: number; z: number; scale: number; shirt?: string; skin?: string; legs?: string }) {
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
      <circle cx={leftEyeX} cy={leftEyeY} r={scale * 0.055} fill={INK} />
      <circle cx={rightEyeX} cy={rightEyeY} r={scale * 0.055} fill={INK} />
      <path
        d={`M ${smileX - scale * 0.11} ${smileY} Q ${smileX} ${smileY + scale * 0.12} ${smileX + scale * 0.11} ${smileY}`}
        fill="none"
        stroke={INK}
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
        fill={CORAL}
        stroke={EDGE}
        strokeWidth="0.6"
      />
      <circle cx={tipX} cy={tipY - scale * 0.1} r={scale * 0.11} fill={BUTTER} />
    </g>
  )
}

function Sparkle({ x, y, size, className }: { x: number; y: number; size: number; className?: string }) {
  const d = `M ${x} ${y - size} Q ${x + size * 0.18} ${y - size * 0.18} ${x + size} ${y} Q ${x + size * 0.18} ${y + size * 0.18} ${x} ${y + size} Q ${x - size * 0.18} ${y + size * 0.18} ${x - size} ${y} Q ${x - size * 0.18} ${y - size * 0.18} ${x} ${y - size} Z`
  return <path d={d} fill={BUTTER} opacity="0.9" className={className} />
}

/**
 * The hero diorama: a floating baseplate world mid-build — stacked bricks,
 * a planted flag, the block explorer, and a few bricks still drifting in.
 * Also the placeholder for `hero-*.{webp,png}` (1600×960, 5:3).
 */
export function HeroDiorama() {
  const s = 30
  return (
    <svg
      className="landing-hero-art"
      viewBox="-300 -190 600 360"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <ellipse cx="0" cy="150" rx="196" ry="30" fill="rgba(38, 60, 81, 0.12)" />
      <g transform="translate(0, 20)">
        {/* Baseplate */}
        <IsoBox x={-3.5} z={-3.5} y={-0.5} w={7} d={7} h={0.5} color={PLATE} scale={s} />
        {/* Back wall with window gap */}
        <IsoBox x={-3} z={-3} y={0} w={4} d={1} h={1.2} color={CORAL} scale={s} />
        <IsoBox x={-3} z={-3} y={1.2} w={2} d={1} h={1.2} color={CORAL} scale={s} />
        <IsoBox x={-3} z={-3} y={2.4} w={4} d={1} h={1.2} color={BUTTER} scale={s} />
        {/* Side steps */}
        <IsoBox x={-3} z={-1.6} y={0} w={1} d={2} h={1.2} color={GREEN} scale={s} />
        <IsoBox x={-3} z={0.6} y={0} w={1} d={2} h={2.4} color={GREEN} scale={s} />
        {/* Tower with flag */}
        <IsoBox x={1.4} z={-2.9} y={0} w={2} d={2} h={3.6} color={BLUE} scale={s} />
        <IsoBox x={1.65} z={-2.65} y={3.6} w={1.5} d={1.5} h={0.5} color={ORCHID} scale={s} />
        <IsoFlag x={2.4} z={-1.9} y={4.1} scale={s} />
        {/* Loose bricks on the plate */}
        <IsoBox x={-1.4} z={2.1} y={0} w={2} d={1} h={1.2} color={BLUE_DEEP} scale={s} />
        <IsoBox x={2.1} z={1.4} y={0} w={1} d={1} h={1.2} color={BUTTER} scale={s} />
        {/* The explorer, out on the open plate so they read at a glance */}
        <IsoCharacter x={0.4} z={0.55} scale={s} />
      </g>
      {/* Bricks drifting in to be placed. Positioning lives on SVG transform
          attributes (broad support); CSS only animates the inner group. */}
      <g transform="translate(-216, -100)">
        <g className="landing-drift landing-drift-a">
          <IsoBox x={0} z={0} y={0} w={2} d={1} h={1.2} color={CORAL} scale={22} />
        </g>
      </g>
      <g transform="translate(212, -122)">
        <g className="landing-drift landing-drift-b">
          <IsoBox x={0} z={0} y={0} w={1} d={1} h={1.2} color={GREEN} scale={19} />
        </g>
      </g>
      <g transform="translate(188, 86)">
        <g className="landing-drift landing-drift-c">
          <IsoBox x={0} z={0} y={0} w={2} d={2} h={0.5} color={ORCHID} scale={17} />
        </g>
      </g>
      <Sparkle x={-206} y={-88} size={9} className="landing-twinkle landing-twinkle-a" />
      <Sparkle x={226} y={-32} size={7} className="landing-twinkle landing-twinkle-b" />
      <Sparkle x={158} y={-148} size={11} className="landing-twinkle landing-twinkle-c" />
    </svg>
  )
}

/** Small vignette for each "How it works" step (build / explore / friends). */
export function StepArt({ kind }: { kind: 'build' | 'explore' | 'friends' }) {
  const s = 15
  return (
    <svg className="landing-step-art" viewBox="-96 -84 192 132" aria-hidden="true" focusable="false">
      <g transform="translate(0, 8)">
        <IsoBox x={-2.5} z={-2.5} y={-0.4} w={5} d={5} h={0.4} color={PLATE} scale={s} />
        {kind === 'build' && (
          <>
            <IsoBox x={-2} z={-2} y={0} w={2} d={1} h={1.2} color={BLUE} scale={s} />
            <IsoBox x={-2} z={-2} y={1.2} w={1} d={1} h={1.2} color={CORAL} scale={s} />
            <IsoBox x={0.5} z={-1} y={0} w={1} d={2} h={1.2} color={BUTTER} scale={s} />
            <IsoBox x={-1} z={1} y={0} w={2} d={1} h={0.4} color={GREEN} scale={s} />
            <g transform="translate(34, -52)">
              <g className="landing-drift landing-drift-a">
                <IsoBox x={0} z={0} y={0} w={1} d={1} h={1.2} color={CORAL} scale={12} />
              </g>
            </g>
          </>
        )}
        {kind === 'explore' && (
          <>
            <IsoBox x={-2.5} z={-2.5} y={0} w={2} d={1} h={2.4} color={BLUE} scale={s} />
            <IsoBox x={-2.5} z={-2.5} y={2.4} w={2} d={1} h={0.4} color={CORAL} scale={s} />
            <IsoBox x={0.5} z={-2.5} y={0} w={2} d={1} h={1.2} color={BUTTER} scale={s} />
            <IsoBox x={-2.5} z={0.5} y={0} w={1} d={2} h={1.2} color={GREEN} scale={s} />
            <IsoCharacter x={0.3} z={0.6} scale={s} />
          </>
        )}
        {kind === 'friends' && (
          <>
            <IsoBox x={-0.5} z={-2.5} y={0} w={1} d={1} h={2.4} color={BLUE} scale={s} />
            <IsoFlag x={0} z={-2} y={2.4} scale={s} />
            <IsoCharacter x={-2.4} z={0.2} scale={s} shirt={CORAL} />
            <IsoCharacter x={0.9} z={0.9} scale={s} shirt={GREEN} skin="#E9C39B" />
          </>
        )}
      </g>
    </svg>
  )
}

/** Placeholder for `scene-*-{800,400}.{webp,png}` (800×500): a plate in each scene's palette. */
export function ScenePlaceholder({ scene }: { scene: 'toy-room' | 'brick-valley' | 'sky-island' }) {
  const s = 17
  const sky = scene === 'toy-room' ? '#F6E6C8' : scene === 'brick-valley' ? '#CFEAF8' : '#DCEFFB'
  const ground = scene === 'toy-room' ? '#D8B27C' : scene === 'brick-valley' ? '#8FCB84' : '#BFE3EA'
  return (
    <svg className="landing-scene-art" viewBox="-160 -100 320 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <rect x="-160" y="-100" width="320" height="200" fill={sky} />
      <ellipse cx="0" cy="62" rx="150" ry="52" fill={ground} />
      {scene === 'sky-island' && <ellipse cx="-96" cy="-42" rx="34" ry="12" fill="white" opacity="0.8" />}
      {scene === 'sky-island' && <ellipse cx="88" cy="-58" rx="26" ry="10" fill="white" opacity="0.8" />}
      {scene === 'toy-room' && <rect x="70" y="-80" width="60" height="70" rx="6" fill="#B6D2F5" opacity="0.7" />}
      {scene === 'brick-valley' && <IsoBox x={-6} z={2} y={-0.4} w={3} d={2} h={2.4} color={GREEN} scale={s} />}
      <g transform="translate(0, 12)">
        <IsoBox x={-2.5} z={-2.5} y={-0.4} w={5} d={5} h={0.4} color={PLATE} scale={s} />
        <IsoBox x={-2} z={-2} y={0} w={2} d={1} h={1.2} color={BLUE} scale={s} />
        <IsoBox x={-2} z={-2} y={1.2} w={2} d={1} h={1.2} color={CORAL} scale={s} />
        <IsoBox x={0.5} z={-1.5} y={0} w={1} d={2} h={1.2} color={BUTTER} scale={s} />
        <IsoCharacter x={-0.3} z={1} scale={s} />
      </g>
    </svg>
  )
}

/** Placeholder for `character-nova-400.{webp,png}` (400×400): Nova, the comet creature. */
export function NovaPlaceholder() {
  return (
    <svg className="landing-character-art" viewBox="-60 -60 120 120" aria-hidden="true" focusable="false">
      <ellipse cx="0" cy="46" rx="34" ry="8" fill="rgba(38, 60, 81, 0.12)" />
      <g transform="translate(-14, 2)">
        <IsoBox x={-1.5} z={-1.5} y={0} w={3} d={2.4} h={2.2} color={ORCHID} studs={false} scale={17} />
        <IsoBox x={-1.9} z={1.2} y={0} w={0.6} d={0.6} h={1} color={shade(ORCHID, -0.15)} studs={false} scale={17} />
        <IsoBox x={1.1} z={1.2} y={0} w={0.6} d={0.6} h={1} color={shade(ORCHID, -0.15)} studs={false} scale={17} />
        <IsoBox x={-1.4} z={-1.9} y={1.9} w={0.5} d={0.5} h={0.8} color="#F49AC1" studs={false} scale={17} />
        <IsoBox x={0.7} z={-1.9} y={1.9} w={0.5} d={0.5} h={0.8} color="#F49AC1" studs={false} scale={17} />
      </g>
      <rect x="4" y="-10" width="22" height="14" rx="4" fill={INK} />
      <rect x="8" y="-6" width="5" height="5" rx="1.5" fill="white" />
      <rect x="17" y="-6" width="5" height="5" rx="1.5" fill="white" />
      <path d="M 30 -30 q 18 -6 26 -22" fill="none" stroke={BUTTER} strokeWidth="4" strokeLinecap="round" />
    </svg>
  )
}

/** A whole-class world: three explorers around one build. */
export function ClassroomVignette() {
  const s = 14
  return (
    <svg className="landing-classroom-art" viewBox="-110 -84 220 140" aria-hidden="true" focusable="false">
      <g transform="translate(0, 10)">
        <IsoBox x={-3.5} z={-3.5} y={-0.4} w={7} d={7} h={0.4} color={PLATE} scale={s} />
        <IsoBox x={-1} z={-1} y={0} w={2} d={2} h={2.4} color={BLUE} scale={s} />
        <IsoBox x={-0.5} z={-0.5} y={2.4} w={1} d={1} h={1.2} color={BUTTER} scale={s} />
        <IsoFlag x={0} z={0} y={3.6} scale={s} />
        <IsoCharacter x={-3.2} z={-0.4} scale={s} shirt={CORAL} />
        <IsoCharacter x={0.8} z={1.9} scale={s} shirt={GREEN} skin="#E9C39B" />
        <IsoCharacter x={-1.6} z={2.2} scale={s} shirt={ORCHID} skin="#C98E63" />
      </g>
    </svg>
  )
}
