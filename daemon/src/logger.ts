type LogLevel = 'info' | 'warn' | 'error' | 'debug'

function formatLog(level: LogLevel, module: string, message: string, data?: Record<string, unknown>): string {
  const ts = new Date().toISOString().slice(11, 23) // HH:mm:ss.SSS
  const dataStr = data ? ' ' + JSON.stringify(data) : ''
  return `${ts} [${level.toUpperCase()}] [${module}] ${message}${dataStr}`
}

export function createLogger(module: string) {
  return {
    info: (message: string, data?: Record<string, unknown>) => console.log(formatLog('info', module, message, data)),
    warn: (message: string, data?: Record<string, unknown>) => console.warn(formatLog('warn', module, message, data)),
    error: (message: string, data?: Record<string, unknown>) => console.error(formatLog('error', module, message, data)),
    debug: (message: string, data?: Record<string, unknown>) => {
      if (process.env.DEBUG) console.log(formatLog('debug', module, message, data))
    },
  }
}
