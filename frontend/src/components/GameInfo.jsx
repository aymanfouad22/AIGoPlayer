import { useEffect, useRef, useState } from 'react'
import Stone from './Stone'

function phase(n) {
  if (n <= 15) return 'Opening'
  if (n <= 50) return 'Midgame'
  return 'Endgame'
}

export default function GameInfo({ currentPlayer, moveNumber, captures, score, thinking }) {
  const [elapsed, setElapsed] = useState(0)
  const timerRef = useRef(null)
  const startRef = useRef(null)

  useEffect(() => {
    if (thinking) {
      startRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setElapsed(((Date.now() - startRef.current) / 1000).toFixed(1))
      }, 100)
    } else {
      clearInterval(timerRef.current)
      setElapsed(0)
    }
    return () => clearInterval(timerRef.current)
  }, [thinking])

  const b = captures?.['1'] ?? 0
  const w = captures?.['2'] ?? 0

  return (
    <div className="flex flex-col gap-4">
      <h1
        className="text-xl font-bold tracking-widest text-goldwood-300 uppercase"
        style={{ fontFamily: "'Cinzel', serif", letterSpacing: '0.15em' }}
      >
        Go 9×9
      </h1>

      {/* Turn */}
      <div className="bg-coffee-700 rounded-lg p-3 flex items-center gap-3 border border-coffee-600">
        <Stone color={currentPlayer} size={22} />
        <div>
          <div className="text-xs text-cream-400 uppercase tracking-widest" style={{ fontFamily: "'Cinzel', serif" }}>Turn</div>
          <div className="font-semibold text-cream-100">
            {thinking ? (
              <span className="text-goldwood-300 animate-pulse">Thinking…</span>
            ) : (
              currentPlayer === 1 ? 'Black' : 'White'
            )}
          </div>
        </div>
        {thinking && (
          <div className="ml-auto text-goldwood-400 font-mono text-sm">{elapsed}s</div>
        )}
      </div>

      {/* Move number + phase */}
      <div className="bg-coffee-700 rounded-lg p-3 border border-coffee-600">
        <div className="flex justify-between items-center">
          <div>
            <div className="text-xs text-cream-400 uppercase tracking-widest" style={{ fontFamily: "'Cinzel', serif" }}>Move</div>
            <div className="text-2xl font-bold text-cream-100">{moveNumber}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-cream-400 uppercase tracking-widest" style={{ fontFamily: "'Cinzel', serif" }}>Phase</div>
            <div className="text-sm font-medium text-goldwood-400">{phase(moveNumber)}</div>
          </div>
        </div>
      </div>

      {/* Captures */}
      <div className="bg-coffee-700 rounded-lg p-3 border border-coffee-600">
        <div className="text-xs text-cream-400 uppercase tracking-widest mb-2" style={{ fontFamily: "'Cinzel', serif" }}>Captured</div>
        <div className="flex flex-col gap-2">
          {[{ label: 'Black', color: 1, count: b }, { label: 'White', color: 2, count: w }].map(({ label, color, count }) => (
            <div key={label} className="flex items-center gap-2">
              <Stone color={color} size={14} />
              <span className="text-cream-200 text-sm w-10">{label}</span>
              <div className="flex gap-1 flex-wrap">
                {Array.from({ length: Math.min(count, 10) }, (_, i) => (
                  <Stone key={i} color={color} size={10} />
                ))}
                {count > 10 && <span className="text-cream-400 text-xs">+{count - 10}</span>}
                {count === 0 && <span className="text-cream-500 text-xs">none</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Live score */}
      {score && (
        <div className="bg-coffee-700 rounded-lg p-3 border border-coffee-600">
          <div className="text-xs text-cream-400 uppercase tracking-widest mb-2" style={{ fontFamily: "'Cinzel', serif" }}>Score</div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[
              { label: 'Black', score: score.black_score, territory: score.black_territory, stones: score.black_stones },
              { label: 'White', score: score.white_score, territory: score.white_territory, stones: score.white_stones },
            ].map(({ label, score: s, territory, stones }) => (
              <div key={label}>
                <div className="font-semibold text-cream-200">{label}</div>
                <div className="text-xl font-bold text-goldwood-400">{s}</div>
                <div className="text-xs text-cream-400">{stones} stones</div>
                <div className="text-xs text-cream-400">{territory} territory</div>
              </div>
            ))}
          </div>
          {score.winner && (
            <div className="mt-2 text-xs text-cream-400 text-center">
              Komi: 2.5 · Leading: <span className="text-goldwood-300 font-semibold">{score.winner}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
