// Key parser zero-deps. Decodifica escape sequences de stdin raw em Key
// objects que as screens consomem. Cobertura: setas, esc, enter, tab,
// backspace, fn-keys basicas, ctrl+letra, alt+letra, char normal.

export interface Key {
  /** Nome canonico: 'up', 'down', 'enter', 'a'..'z', '0'..'9', etc */
  name: string
  /** Sequencia raw (debug). */
  sequence: string
  /** Tem ctrl modifier? (ctrl+c, ctrl+r, etc). */
  ctrl?: boolean
  /** Tem alt/meta modifier? */
  meta?: boolean
  /** Tem shift modifier? (apenas confiavel pra letras maiusculas). */
  shift?: boolean
}

const ESC = '\x1b'

/** Decodifica um chunk de stdin em uma ou mais Keys (paste pode ter varias). */
export function parseKey(chunk: string): Key[] {
  const keys: Key[] = []
  let i = 0
  while (i < chunk.length) {
    const c = chunk[i]

    // ESC sequences
    if (c === ESC) {
      // Lone ESC (no following char) → 'escape'
      if (i + 1 >= chunk.length) {
        keys.push({ name: 'escape', sequence: ESC })
        i++
        continue
      }

      const next = chunk[i + 1]

      // Alt+<letter>: ESC <letter>
      if (next !== '[' && next !== 'O' && /^[a-zA-Z0-9]$/.test(next)) {
        keys.push({ name: next.toLowerCase(), sequence: chunk.slice(i, i + 2), meta: true, shift: /[A-Z]/.test(next) })
        i += 2
        continue
      }

      // CSI: ESC [ ...
      if (next === '[' || next === 'O') {
        // Find end of sequence (terminated by letter)
        let end = i + 2
        while (end < chunk.length && !/[a-zA-Z~]/.test(chunk[end])) end++
        if (end >= chunk.length) {
          // Incomplete — push as raw escape and stop
          keys.push({ name: 'escape', sequence: chunk.slice(i) })
          break
        }
        const seq = chunk.slice(i, end + 1)
        const key = decodeCSI(seq)
        if (key) keys.push(key)
        i = end + 1
        continue
      }

      // Unknown escape — skip
      keys.push({ name: 'escape', sequence: chunk.slice(i, i + 1) })
      i++
      continue
    }

    // Control characters
    if (c === '\r' || c === '\n') {
      keys.push({ name: 'enter', sequence: c })
      i++
      continue
    }
    if (c === '\t') {
      keys.push({ name: 'tab', sequence: c })
      i++
      continue
    }
    if (c === '\x7f' || c === '\b') {
      keys.push({ name: 'backspace', sequence: c })
      i++
      continue
    }
    if (c === ' ') {
      keys.push({ name: 'space', sequence: c })
      i++
      continue
    }

    // Ctrl + letter: 0x01-0x1A correspondem a Ctrl+A-Z
    const code = c.charCodeAt(0)
    if (code >= 1 && code <= 26) {
      keys.push({
        name: String.fromCharCode(code + 96), // 'a'-'z'
        sequence: c,
        ctrl: true,
      })
      i++
      continue
    }

    // Printable
    keys.push({
      name: c.toLowerCase(),
      sequence: c,
      shift: /[A-Z]/.test(c),
    })
    i++
  }
  return keys
}

function decodeCSI(seq: string): Key | null {
  // Cobertura: setas, home/end, page up/down, delete, F1-F12 basico
  // Suporta com/sem prefixo modifier (1;2 etc)
  const last = seq[seq.length - 1]

  // Simple arrows: ESC [ A/B/C/D
  if (last === 'A') return { name: 'up', sequence: seq }
  if (last === 'B') return { name: 'down', sequence: seq }
  if (last === 'C') return { name: 'right', sequence: seq }
  if (last === 'D') return { name: 'left', sequence: seq }
  if (last === 'H') return { name: 'home', sequence: seq }
  if (last === 'F') return { name: 'end', sequence: seq }

  // Tilde-terminated: ESC [ <num> ~
  if (last === '~') {
    const num = seq.slice(2, -1).split(';')[0]
    switch (num) {
      case '1': return { name: 'home', sequence: seq }
      case '2': return { name: 'insert', sequence: seq }
      case '3': return { name: 'delete', sequence: seq }
      case '4': return { name: 'end', sequence: seq }
      case '5': return { name: 'pageup', sequence: seq }
      case '6': return { name: 'pagedown', sequence: seq }
      case '11': return { name: 'f1', sequence: seq }
      case '12': return { name: 'f2', sequence: seq }
      case '13': return { name: 'f3', sequence: seq }
      case '14': return { name: 'f4', sequence: seq }
      case '15': return { name: 'f5', sequence: seq }
      case '17': return { name: 'f6', sequence: seq }
      case '18': return { name: 'f7', sequence: seq }
      case '19': return { name: 'f8', sequence: seq }
      case '20': return { name: 'f9', sequence: seq }
      case '21': return { name: 'f10', sequence: seq }
      case '23': return { name: 'f11', sequence: seq }
      case '24': return { name: 'f12', sequence: seq }
    }
  }

  // ESC O P/Q/R/S = F1..F4 (xterm legacy)
  if (seq[1] === 'O') {
    const map: Record<string, string> = { P: 'f1', Q: 'f2', R: 'f3', S: 'f4' }
    if (map[last]) return { name: map[last], sequence: seq }
  }

  return null
}
