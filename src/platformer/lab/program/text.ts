import { COSTUME_LABELS, COLOR_LABELS, SOUND_LABELS } from './catalog'
import { PHRASE_TEXT, type BrickRef, type Expr, type ProgramIR, type Stmt, type Trigger, type Who } from './types'

/*
 * The same program as text, to read next to the blocks: JavaScript-style or Python-style. Read-only and printed
 * from the compiled IR, so it always says exactly what runs; it is never parsed back and never run.
 */

export type TextLanguage = 'js' | 'py'

const WHO_JS: Record<Who, string> = { me: 'me', it: 'it', them: 'them', player: 'player', rider: 'rider' }

function quote(s: string) {
  return JSON.stringify(s)
}

function camel(words: string, lang: TextLanguage) {
  const parts = words.split(/[^a-zA-Z0-9]+/).filter(Boolean)
  if (lang === 'py') return parts.map((p) => p.toLowerCase()).join('_')
  return parts.map((p, i) => (i === 0 ? p.toLowerCase() : p[0].toUpperCase() + p.slice(1).toLowerCase())).join('')
}

export function programText(ir: ProgramIR, lang: TextLanguage, bricks: readonly BrickRef[]): string {
  const brickName = (id: string) => bricks.find((b) => b.id === id)?.name ?? id
  const target = (t: string) => {
    if (t === 'player') return 'player'
    if (t === 'any') return 'anything'
    if (t.startsWith('tile:')) return t.slice(5) === 'solid' ? 'ground' : t.slice(5)
    if (t.startsWith('brick:')) return brickName(t.slice(6))
    return t
  }
  const call = (name: string, ...args: string[]) => `${camel(name, lang)}(${args.join(', ')})`
  const method = (who: Who, name: string, ...args: string[]) => `${WHO_JS[who]}.${call(name, ...args)}`
  const bool = (v: boolean) => (lang === 'py' ? (v ? 'True' : 'False') : String(v))

  const expr = (e: Expr): string => {
    switch (e.kind) {
      case 'number':
        return String(e.value)
      case 'boolean':
        return bool(e.value)
      case 'binary': {
        const op = lang === 'py' ? ({ and: 'and', or: 'or', '==': '==', '!=': '!=' } as Record<string, string>)[e.op] ?? e.op : ({ and: '&&', or: '||', '==': '===', '!=': '!==' } as Record<string, string>)[e.op] ?? e.op
        return `(${expr(e.left)} ${op} ${expr(e.right)})`
      }
      case 'not':
        return lang === 'py' ? `not ${expr(e.operand)}` : `!${expr(e.operand)}`
      case 'random':
        return call('random', expr(e.low), expr(e.high))
      case 'keyHeld':
        return call('key held', quote(e.key))
      case 'onGround':
        return `me.${lang === 'py' ? 'on_ground' : 'onGround'}`
      case 'touching':
        return method('me', 'touching', quote(target(e.target)))
      case 'probe':
        return call('is there', quote(e.what), quote(e.where === 'aheadDown' ? 'ahead and down' : e.where))
      case 'speed':
        return method('me', 'speed', quote(e.dir))
      case 'hasRider':
        return `me.${lang === 'py' ? 'has_rider' : 'hasRider'}`
      case 'isRiding':
        return `me.${lang === 'py' ? 'is_riding' : 'isRiding'}`
      case 'age':
        return `me.${lang === 'py' ? 'seconds_since_appeared' : 'secondsSinceAppeared'}`
      case 'distance':
        return method('me', 'distance to', WHO_JS[e.who])
      case 'memory':
        return `${e.scope === 'my' ? 'me' : 'player'}.memory.${e.name}`
      case 'variable':
        return `${e.scope === 'my' ? 'me' : e.scope}.variables.${e.name}`
      case 'argument':
        return e.name
      case 'position':
        return `${WHO_JS[e.who]}.${e.axis}`
    }
  }

  const lines: string[] = []
  const pad = (depth: number) => '    '.repeat(depth)
  const open = (depth: number, head: string) => lines.push(lang === 'py' ? `${pad(depth)}${head}:` : `${pad(depth)}${head} {`)
  const close = (depth: number) => {
    if (lang === 'js') lines.push(`${pad(depth)}}`)
  }
  const block = (list: readonly Stmt[], depth: number) => {
    if (!list.length && lang === 'py') lines.push(`${pad(depth)}pass`)
    for (const s of list) stmt(s, depth)
  }
  const line = (depth: number, text: string) => lines.push(`${pad(depth)}${text}`)

  const stmt = (s: Stmt, d: number) => {
    switch (s.op) {
      case 'setSpeed':
        return line(d, method(s.who, 'set speed', quote(s.dir), expr(s.value)))
      case 'changeSpeed':
        return line(d, method(s.who, 'change speed', quote(s.dir), expr(s.by)))
      case 'launch':
        return line(d, method(s.who, 'launch', expr(s.angle), expr(s.power)))
      case 'stopMoving':
        return line(d, method(s.who, 'stop moving'))
      case 'turnAround':
        return line(d, method('me', 'turn around'))
      case 'face':
        return line(d, method('me', 'face', quote(s.toward)))
      case 'moveTo':
        return line(d, method(s.who, 'move to', quote(s.place)))
      case 'moveXY':
        return line(d, method(s.who, 'move to', expr(s.x), expr(s.y)))
      case 'setControls':
        return line(d, method(s.who, 'set controls', bool(s.enabled)))
      case 'setPhysics':
        return line(d, method(s.who, 'set physics', bool(s.enabled)))
      case 'setVisible':
        return line(d, method(s.who, s.visible ? 'show' : 'hide'))
      case 'frame':
        return line(d, `me.costumeFrame = ${expr(s.frame)}`)
      case 'nextFrame':
        return line(d, method('me', 'next costume frame'))
      case 'playFrames':
        return line(d, method('me', 'play costume frames', expr(s.fps)))
      case 'stopFrames':
        return line(d, method('me', 'stop costume frames'))
      case 'sayText':
        return line(d, method('me', 'say', quote(s.text), expr(s.seconds)))
      case 'hero':
        return line(d, method('me', s.on ? 'run and jump with keys' : 'stop running with keys'))
      case 'heroStat':
        return line(d, `me.${camel(s.stat === 'jump' ? 'jump power' : 'run speed', lang)} = ${expr(s.percent)}`)
      case 'make':
        return line(d, `it = ${call('make', quote(brickName(s.brick)), quote(s.place))}`)
      case 'makeXY':
        return line(d, `it = ${call('make at', quote(brickName(s.brick)), expr(s.x), expr(s.y))}`)
      case 'remove':
        return line(d, method(s.who, 'remove'))
      case 'hurt':
        return line(d, method(s.who, 'hurt'))
      case 'body':
        return line(d, `me.${s.setting} = ${expr(s.percent)}`)
      case 'solid':
        return line(d, `me.solid = ${quote(s.mode)}`)
      case 'letRide':
        return line(d, method('me', 'let ride', WHO_JS[s.who]))
      case 'dropRider':
        return line(d, method('me', 'drop rider'))
      case 'costume':
        return line(d, `me.costume = ${quote(COSTUME_LABELS[s.costume])}`)
      case 'color':
        return line(d, `me.color = ${quote(COLOR_LABELS[s.color].replace(/^\S+ /, ''))}`)
      case 'size':
        return line(d, `me.size = ${expr(s.percent)}`)
      case 'say':
        return line(d, method('me', 'say', quote(PHRASE_TEXT[s.phrase]), expr(s.seconds)))
      case 'show':
        return line(d, method('me', 'show above', `${s.scope === 'my' ? 'me' : 'player'}.memory.${s.name}`))
      case 'sound':
        return line(d, call('play sound', quote(SOUND_LABELS[s.sound])))
      case 'setMemory':
        return line(d, `${s.scope === 'my' ? 'me' : 'player'}.memory.${s.name} = ${expr(s.value)}`)
      case 'changeMemory':
        return line(d, `${s.scope === 'my' ? 'me' : 'player'}.memory.${s.name} += ${expr(s.by)}`)
      case 'setVariable':
        return line(d, `${s.scope === 'my' ? 'me' : s.scope}.variables.${s.name} = ${expr(s.value)}`)
      case 'changeVariable':
        return line(d, `${s.scope === 'my' ? 'me' : s.scope}.variables.${s.name} += ${expr(s.by)}`)
      case 'call':
        return line(d, `${lang === 'js' ? 'await ' : ''}${s.name}(${s.args.map(expr).join(', ')})`)
      case 'broadcast':
        return line(d, call('broadcast', quote(s.message)))
      case 'wait':
        return line(d, lang === 'py' ? `wait(${expr(s.seconds)})` : `await wait(${expr(s.seconds)})`)
      case 'waitUntil':
        return line(d, lang === 'py' ? `wait_until(lambda: ${expr(s.condition)})` : `await waitUntil(() => ${expr(s.condition)})`)
      case 'repeat':
        open(d, lang === 'py' ? `for _ in range(${expr(s.count)})` : `for (let i = 0; i < ${expr(s.count)}; i++)`)
        block(s.body, d + 1)
        return close(d)
      case 'forever':
        open(d, lang === 'py' ? 'while True' : 'while (true)')
        block(s.body, d + 1)
        if (lang === 'js') line(d + 1, 'await nextFrame()')
        else line(d + 1, 'next_frame()')
        return close(d)
      case 'if':
        open(d, lang === 'py' ? `if ${expr(s.condition)}` : `if (${expr(s.condition)})`)
        block(s.then, d + 1)
        if (s.else) {
          if (lang === 'js') lines.push(`${pad(d)}} else {`)
          else lines.push(`${pad(d)}else:`)
          block(s.else, d + 1)
        }
        return close(d)
      case 'stopScript':
        return line(d, 'return')
    }
  }

  const hat = (t: Trigger): string => {
    const q = (...a: string[]) => a.map(quote).join(', ')
    switch (t.kind) {
      case 'appear':
        return 'appear'
      case 'key':
        return `key pressed, ${q(t.key)}`
      case 'touch':
        return `touch, ${q(target(t.target), t.side === 'any' ? 'anywhere' : `on my ${t.side}`)}`
      case 'every':
        return `every, ${t.seconds}`
      case 'message':
        return `message, ${q(t.message)}`
      case 'clicked':
        return 'clicked'
      default:
        return t.kind === 'stomped' ? 'stomped' : t.kind === 'land' ? 'land' : 'hurt'
    }
  }

  ir.scripts.forEach((script, i) => {
    const [name, ...rest] = hat(script.trigger).split(', ')
    const them = script.trigger.kind === 'touch' || script.trigger.kind === 'stomped' || script.trigger.kind === 'hurt'
    if (lang === 'py') {
      lines.push(`@when_${camel(name, 'py')}(${rest.join(', ')})`)
      lines.push(`def script_${i + 1}(${them ? 'them' : ''}):`)
      block(script.body, 1)
    } else {
      lines.push(`when(${[quote(name), ...rest].join(', ')}, async (${them ? 'them' : ''}) => {`)
      block(script.body, 1)
      lines.push('})')
    }
    lines.push('')
  })
  for (const procedure of ir.procedures ?? []) {
    if (lang === 'py') {
      lines.push(`def ${procedure.name}(${procedure.params.join(', ')}):`)
      block(procedure.body, 1)
    } else {
      lines.push(`async function ${procedure.name}(${procedure.params.join(', ')}) {`)
      block(procedure.body, 1)
      lines.push('}')
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd() + '\n'
}
