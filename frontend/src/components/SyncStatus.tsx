import { useEffect, useState } from 'react'

interface Props {
  dataUpdatedAt: number
  isError: boolean
}

export function SyncStatus({ dataUpdatedAt, isError }: Props) {
  const [elapsed, setElapsed] = useState(
    () => (dataUpdatedAt ? Math.floor((Date.now() - dataUpdatedAt) / 1000) : 0),
  )

  useEffect(() => {
    if (!dataUpdatedAt) return
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - dataUpdatedAt) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [dataUpdatedAt])

  const label = isError
    ? 'API unavailable'
    : !dataUpdatedAt
      ? null
      : elapsed < 5
        ? 'Updated just now'
        : `Updated ${elapsed}s ago`

  if (!label) return null

  return (
    <div
      data-testid="sync-status"
      style={{ position: 'absolute', top: 16, right: 16, zIndex: 10 }}
      className="bg-white/80 backdrop-blur-sm rounded-lg px-2 py-1 shadow-sm"
    >
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  )
}
