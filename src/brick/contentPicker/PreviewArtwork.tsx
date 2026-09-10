import type { CSSProperties } from 'react'
import type { CharacterPalette } from '../characters/types'

type PreviewArtworkProps = {
  kind: 'environment' | 'character'
  previewKey: string
  palette?: Readonly<CharacterPalette>
}

function ClassicStudioArtwork() {
  return (
    <svg viewBox="0 0 200 110" preserveAspectRatio="xMidYMid slice" data-artwork="classic-studio">
      <rect className="preview-classic-wall" width="200" height="66" />
      <path className="preview-classic-floor" d="M0 66h200v44H0z" />
      <path className="preview-classic-grid" d="m0 79 200-5M0 96l200-12M38 66l-8 44M82 66l-3 44M126 66l4 44M168 66l10 44" />
      <path className="preview-baseplate" d="m23 74 116-8 42 25-121 13z" />
      <g className="preview-classic-studs">
        <ellipse cx="57" cy="77" rx="8" ry="4" /><ellipse cx="80" cy="75" rx="8" ry="4" />
        <ellipse cx="104" cy="73" rx="8" ry="4" /><ellipse cx="128" cy="72" rx="8" ry="4" />
        <ellipse cx="72" cy="88" rx="8" ry="4" /><ellipse cx="98" cy="85" rx="8" ry="4" />
        <ellipse cx="125" cy="83" rx="8" ry="4" /><ellipse cx="151" cy="81" rx="8" ry="4" />
      </g>
      <path className="preview-brick-red" d="M50 60h40v24H50z" />
      <path className="preview-brick-red-top" d="m50 60 13-6h39l-12 6z" />
      <ellipse className="preview-brick-red-stud" cx="68" cy="55" rx="7" ry="3" />
      <ellipse className="preview-brick-red-stud" cx="88" cy="55" rx="7" ry="3" />
      <path className="preview-brick-blue" d="m93 69 34-2v18l-34 3z" />
      <ellipse className="preview-brick-blue-stud" cx="103" cy="68" rx="6" ry="3" />
      <ellipse className="preview-brick-blue-stud" cx="119" cy="67" rx="6" ry="3" />
      <circle className="preview-studio-lamp" cx="164" cy="24" r="12" />
      <path className="preview-studio-lamp-arm" d="m164 36-13 25" />
    </svg>
  )
}

function ToyRoomArtwork() {
  return (
    <svg viewBox="0 0 200 110" preserveAspectRatio="xMidYMid slice" data-artwork="toy-room">
      <rect className="preview-room-wall" width="200" height="82" />
      <rect className="preview-room-window" x="20" y="13" width="51" height="42" rx="3" />
      <path className="preview-room-window-frame" d="M45.5 13v42M20 34h51" />
      <circle className="preview-room-sun" cx="33" cy="24" r="7" />
      <path className="preview-room-curtain" d="M12 8h14l-3 55H9zM66 8h14l5 55H70z" />
      <path className="preview-room-shelf" d="M111 18h69v6h-69zM117 24h57v29h-57z" />
      <rect className="preview-room-book-one" x="122" y="30" width="8" height="19" rx="1" />
      <rect className="preview-room-book-two" x="132" y="26" width="9" height="23" rx="1" />
      <circle className="preview-room-ball" cx="158" cy="41" r="8" />
      <path className="preview-room-table" d="M0 68h200v42H0z" />
      <path className="preview-room-table-edge" d="M0 68h200v8H0z" />
      <path className="preview-room-track" d="M11 100c28-26 64-22 91-4 29 19 62 9 87-13" />
      <g className="preview-room-blocks">
        <rect x="89" y="57" width="29" height="18" rx="2" />
        <rect x="117" y="50" width="24" height="25" rx="2" />
        <rect x="139" y="61" width="32" height="14" rx="2" />
      </g>
      <g className="preview-room-studs">
        <ellipse cx="96" cy="57" rx="5" ry="2.5" /><ellipse cx="109" cy="57" rx="5" ry="2.5" />
        <ellipse cx="124" cy="50" rx="5" ry="2.5" /><ellipse cx="135" cy="50" rx="5" ry="2.5" />
        <ellipse cx="148" cy="61" rx="5" ry="2.5" /><ellipse cx="162" cy="61" rx="5" ry="2.5" />
      </g>
    </svg>
  )
}

function BrickValleyArtwork() {
  return (
    <svg viewBox="0 0 200 110" preserveAspectRatio="xMidYMid slice" data-artwork="brick-valley">
      <rect className="preview-valley-sky" width="200" height="110" />
      <g className="preview-valley-clouds">
        <ellipse cx="42" cy="20" rx="24" ry="8" /><circle cx="35" cy="15" r="9" /><circle cx="50" cy="14" r="11" />
        <ellipse cx="164" cy="29" rx="19" ry="6" /><circle cx="157" cy="25" r="7" /><circle cx="169" cy="24" r="9" />
      </g>
      <circle className="preview-valley-sun" cx="168" cy="15" r="10" />
      <path className="preview-valley-back" d="M0 66 35 42l22 14 27-30 35 31 25-20 56 30v43H0z" />
      <path className="preview-valley-front" d="M0 75 47 58l31 17 39-24 42 18 41-7v48H0z" />
      <path className="preview-valley-river" d="M95 55c-17 17-15 31 7 55h46c-26-26-35-37-20-54z" />
      <g className="preview-valley-bricks">
        <path d="M9 65h38v23H9z" /><path d="M13 59h30v7H13z" />
        <path d="M142 51h37v27h-37z" /><path d="M147 45h27v7h-27z" />
        <path d="M34 79h35v25H34z" /><path d="M39 73h25v7H39z" />
      </g>
      <g className="preview-valley-studs">
        <ellipse cx="19" cy="59" rx="5" ry="2.5" /><ellipse cx="35" cy="59" rx="5" ry="2.5" />
        <ellipse cx="155" cy="45" rx="5" ry="2.5" /><ellipse cx="168" cy="45" rx="5" ry="2.5" />
        <ellipse cx="47" cy="73" rx="5" ry="2.5" /><ellipse cx="59" cy="73" rx="5" ry="2.5" />
      </g>
    </svg>
  )
}

function SkyIslandArtwork() {
  return (
    <svg viewBox="0 0 200 110" preserveAspectRatio="xMidYMid slice" data-artwork="sky-island">
      <rect className="preview-island-sky" width="200" height="110" />
      <g className="preview-island-clouds">
        <ellipse cx="31" cy="72" rx="28" ry="8" /><circle cx="22" cy="67" r="10" /><circle cx="39" cy="66" r="12" />
        <ellipse cx="173" cy="32" rx="24" ry="7" /><circle cx="166" cy="28" r="8" /><circle cx="179" cy="27" r="10" />
        <ellipse cx="165" cy="94" rx="35" ry="9" /><circle cx="153" cy="88" r="12" /><circle cx="175" cy="88" r="14" />
      </g>
      <path className="preview-island-grass" d="M44 42c20-14 84-15 112 0-12 13-35 18-56 17-23 1-43-4-56-17Z" />
      <path className="preview-island-rock" d="M49 47c15 8 87 9 102 0-8 27-28 47-52 59-23-12-42-32-50-59Z" />
      <path className="preview-island-rock-detail" d="m69 55 13 35M127 56l-12 36M97 58l2 47" />
      <path className="preview-island-water" d="M111 42c7 2 13 2 20 0-2 20-2 40 3 59-8-3-15-3-23 0 5-23 4-41 0-59Z" />
      <path className="preview-island-ruin" d="M75 33h10v14H75zM105 28h11v20h-11zM81 30h29v6H81z" />
      <path className="preview-island-tree" d="M137 25h5v22h-5z" />
      <circle className="preview-island-tree-top" cx="139" cy="22" r="11" />
      <path className="preview-island-distant" d="M10 28c9-7 26-7 35 0-8 7-27 7-35 0ZM156 62c9-7 24-7 34 0-8 7-26 7-34 0Z" />
    </svg>
  )
}

function ClassicBuilderArtwork() {
  return (
    <svg viewBox="0 0 200 110" preserveAspectRatio="xMidYMid slice" data-artwork="classic-builder">
      <rect className="preview-character-studio" width="200" height="110" />
      <ellipse className="preview-character-shadow" cx="100" cy="98" rx="43" ry="8" />
      <g className="preview-builder">
        <path className="preview-builder-leg-left" d="M73 72h24v27H69z" />
        <path className="preview-builder-leg-right" d="M103 72h24l4 27h-28z" />
        <path className="preview-builder-arm-left" d="m64 49 19 4-8 31-16-5z" />
        <path className="preview-builder-arm-right" d="m117 53 19-4 5 30-16 5z" />
        <path className="preview-builder-body" d="M78 44h44l5 33H73z" />
        <path className="preview-builder-badge" d="M102 51h10v10h-10z" />
        <rect className="preview-builder-head" x="80" y="13" width="40" height="36" rx="9" />
        <path className="preview-builder-hair" d="M80 28V16c11-8 31-7 40 2v11l-7-6-7 4-9-7-8 7z" />
        <circle className="preview-character-eye" cx="93" cy="32" r="2" />
        <circle className="preview-character-eye" cx="108" cy="32" r="2" />
        <path className="preview-character-smile" d="M94 39c4 4 9 4 13 0" />
      </g>
    </svg>
  )
}

function ToyFigureArtwork() {
  return (
    <svg viewBox="0 0 200 110" preserveAspectRatio="xMidYMid slice" data-artwork="toy-figure">
      <rect className="preview-character-playroom" width="200" height="110" />
      <path className="preview-toy-rainbow" d="M-8 83c33-39 57-43 87-2M127 2c22 4 47 22 78 63" />
      <ellipse className="preview-character-shadow" cx="100" cy="99" rx="45" ry="8" />
      <g className="preview-toy">
        <path className="preview-toy-leg-left" d="M75 72h23v27H70z" />
        <path className="preview-toy-leg-right" d="M102 72h23l5 27h-28z" />
        <circle className="preview-toy-hand" cx="61" cy="74" r="9" />
        <circle className="preview-toy-hand" cx="139" cy="74" r="9" />
        <path className="preview-toy-arm-left" d="m77 49-13 6-9 22 15 5 13-20z" />
        <path className="preview-toy-arm-right" d="m123 49 13 6 9 22-15 5-13-20z" />
        <path className="preview-toy-body" d="M78 45h44l8 32H70z" />
        <circle className="preview-toy-emblem" cx="100" cy="60" r="8" />
        <circle className="preview-toy-head" cx="100" cy="29" r="22" />
        <path className="preview-toy-cap" d="M78 26c3-22 40-24 45-2-11-6-29-5-45 2Z" />
        <circle className="preview-character-eye" cx="92" cy="30" r="2.5" />
        <circle className="preview-character-eye" cx="108" cy="30" r="2.5" />
        <path className="preview-character-smile" d="M91 38c6 6 13 6 19 0" />
      </g>
    </svg>
  )
}

function RobotHeroArtwork() {
  return (
    <svg viewBox="0 0 200 110" preserveAspectRatio="xMidYMid slice" data-artwork="robot-hero">
      <rect className="preview-character-space" width="200" height="110" />
      <g className="preview-space-stars">
        <circle cx="25" cy="21" r="2" /><circle cx="49" cy="45" r="1.5" /><circle cx="161" cy="20" r="2" />
        <circle cx="178" cy="50" r="1.5" /><circle cx="139" cy="9" r="1" /><circle cx="16" cy="77" r="1" />
      </g>
      <ellipse className="preview-character-shadow" cx="100" cy="99" rx="48" ry="8" />
      <g className="preview-robot">
        <path className="preview-robot-leg-left" d="M74 70h23l-3 29H67z" />
        <path className="preview-robot-leg-right" d="M103 70h23l7 29h-27z" />
        <path className="preview-robot-shoulders" d="M59 47 79 39h42l20 8-7 19-14-6v22H80V60l-14 6z" />
        <rect className="preview-robot-hand" x="57" y="61" width="14" height="12" rx="4" />
        <rect className="preview-robot-hand" x="129" y="61" width="14" height="12" rx="4" />
        <path className="preview-robot-chest" d="M83 45h34l7 32H76z" />
        <path className="preview-robot-core" d="m100 51 10 8-10 11-10-11z" />
        <path className="preview-robot-head" d="m79 17 9-9h24l9 9-3 28H82z" />
        <path className="preview-robot-face" d="M86 22h28l-4 13H90z" />
        <path className="preview-robot-eye" d="M92 27h16" />
        <path className="preview-robot-antenna" d="M100 8V2" />
        <circle className="preview-robot-antenna-tip" cx="100" cy="3" r="3" />
      </g>
    </svg>
  )
}

function FallbackArtwork({ kind }: { kind: PreviewArtworkProps['kind'] }) {
  return kind === 'environment' ? <ClassicStudioArtwork /> : <ClassicBuilderArtwork />
}

export function PreviewArtwork({ kind, previewKey, palette }: PreviewArtworkProps) {
  let artwork
  switch (previewKey) {
    case 'environment:classic': artwork = <ClassicStudioArtwork />; break
    case 'environment:toy-room': artwork = <ToyRoomArtwork />; break
    case 'environment:brick-valley': artwork = <BrickValleyArtwork />; break
    case 'environment:sky-island': artwork = <SkyIslandArtwork />; break
    case 'character:classic': artwork = <ClassicBuilderArtwork />; break
    case 'character:toy-figure': artwork = <ToyFigureArtwork />; break
    case 'character:cc0-hero': artwork = <RobotHeroArtwork />; break
    default: artwork = <FallbackArtwork kind={kind} />
  }

  return (
    <span
      className={`content-picker-art content-picker-art-${kind}`}
      data-preview-key={previewKey}
      style={kind === 'character' && palette ? {
        '--preview-character-primary': palette.primary,
        '--preview-character-secondary': palette.secondary,
        '--preview-character-accent': palette.accent,
      } as CSSProperties : undefined}
      aria-hidden="true"
    >
      {artwork}
    </span>
  )
}

export default PreviewArtwork
