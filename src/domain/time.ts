import type { Minutes } from './models'

export function parseClock(clock: string): Minutes {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock)
  if (!match) throw new Error(`Invalid clock: ${clock}`)
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 47 || minutes > 59) throw new Error(`Invalid clock: ${clock}`)
  return hours * 60 + minutes
}

export function formatClock(value: Minutes): string {
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}
