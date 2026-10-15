import { BBC_RAMP, METOFFICE_BANDS, formatMm, type MapTheme, type RainfallScale } from '../utils/rainfallScale'

interface Props {
  scale: RainfallScale
  theme: MapTheme
}

export function RainfallLegend({ scale, theme }: Props) {
  return (
    <div
      data-testid="rainfall-legend"
      style={{ position: 'absolute', bottom: 32, left: 16, zIndex: 10 }}
      className="pointer-events-none select-none rounded-lg bg-slate-950/75 px-3 py-2.5 text-white shadow-lg backdrop-blur-sm"
    >
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider opacity-80">
        Rainfall · {scale.label}
      </p>
      {theme === 'bbc' ? <BbcBar scale={scale} /> : <MetOfficeBands scale={scale} />}
      <p data-testid="no-data-note" className="mt-2 flex items-center gap-1.5 text-[10px] opacity-75">
        <span className="h-2.5 w-2.5 rounded-[2px] bg-slate-400/60" />
        No data yet: Wales, N. Ireland
      </p>
      <p data-testid="coverage-note" className="mt-1 text-[10px] opacity-60">
        Fades out where no gauge is within ~25 km
      </p>
    </div>
  )
}

function BbcBar({ scale }: { scale: RainfallScale }) {
  const gradient = `linear-gradient(to right, ${BBC_RAMP.map((c, i) => `${c} ${(i / (BBC_RAMP.length - 1)) * 100}%`).join(', ')})`
  const ticks = [scale.floor, ...scale.bounds]
  return (
    <div className="w-64">
      <div className="flex items-center gap-1.5">
        <span className="text-[9px] opacity-60">dry</span>
        <div className="h-2.5 flex-1 rounded-sm" style={{ background: gradient }} />
      </div>
      <div className="mt-1 flex justify-between pl-5 text-[10px] leading-none opacity-80">
        {ticks.map((mm, i) => (
          <span key={i}>{formatMm(mm)}{i === ticks.length - 1 ? '+' : ''}</span>
        ))}
      </div>
      <p className="mt-1 text-center text-[9px] opacity-50">mm</p>
    </div>
  )
}

function MetOfficeBands({ scale }: { scale: RainfallScale }) {
  const b = scale.bounds
  const labels = METOFFICE_BANDS.map((_, i) =>
    i === 0 ? `<${formatMm(b[0])}` : i === b.length ? `>${formatMm(b[i - 1])}` : `${formatMm(b[i - 1])}–${formatMm(b[i])}`,
  )
  return (
    <div className="flex flex-col-reverse gap-0.5">
      {METOFFICE_BANDS.map((c, i) => (
        <div key={c} className="flex items-center gap-2 text-[10px] leading-none">
          <span className="h-3 w-3 rounded-[2px]" style={{ background: c }} />
          <span className="opacity-85">{labels[i]} mm</span>
        </div>
      ))}
    </div>
  )
}
