import { useEffect, useState } from 'react'

interface Props {
  failureCount: number
  lastUpdatedAt: number
}

export function OfflineBanner({ failureCount, lastUpdatedAt }: Props) {
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (failureCount > 0) return
    const id = setTimeout(() => setDismissed(false), 0)
    return () => clearTimeout(id)
  }, [failureCount])

  if (failureCount < 3 || dismissed) return null

  const lastUpdate = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleTimeString()
    : 'unknown'

  return (
    <div
      data-testid="offline-banner"
      style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}
      className="bg-amber-50 border border-amber-300 rounded-lg px-4 py-2 flex items-center gap-3 shadow-md whitespace-nowrap"
    >
      <span className="text-sm text-amber-800">
        EA API unavailable — showing cached data. Last updated: {lastUpdate}
      </span>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="text-amber-600 hover:text-amber-900 font-bold text-lg leading-none"
      >
        ×
      </button>
    </div>
  )
}
