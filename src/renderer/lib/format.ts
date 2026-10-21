const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60],
]

export function timeAgo(iso: string) {
  const s = (Date.parse(iso) - Date.now()) / 1000
  for (const [unit, secs] of UNITS) if (Math.abs(s) >= secs) return rtf.format(Math.round(s / secs), unit)
  return "just now"
}

export function duration(fromIso: string, toIso: string | null, now = Date.now()) {
  const s = Math.max(0, Math.round(((toIso ? Date.parse(toIso) : now) - Date.parse(fromIso)) / 1000))
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`
}
