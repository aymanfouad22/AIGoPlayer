import { useEffect, useRef, useState } from 'react'
import Stone from './Stone'

function phase(n) {
  if (n <= 15) return { label: 'Opening', color: '#6B8F6B' }
  if (n <= 50) return { label: 'Midgame', color: '#C97B3A' }
  return { label: 'Endgame', color: '#B85450' }
}

function MiniStones({ color, count }) {
  return (
    <div className="mini-stones">
      {Array.from({ length: Math.min(count, 10) }, (_, i) => (
        <Stone key={i} color={color} size={10} />
      ))}
      {count > 10 && <span className="mini-more">+{count - 10}</span>}
      {count === 0 && <span className="mini-empty">0</span>}
    </div>
  )
}

export default function GameInfo({ currentPlayer, moveNumber, captures, score, thinking }) {
  const [elapsed, setElapsed] = useState('0.0')
  const timerRef = useRef(null)
  const startRef = useRef(null)
  const currentPhase = phase(moveNumber)

  useEffect(() => {
    if (thinking) {
      startRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setElapsed(((Date.now() - startRef.current) / 1000).toFixed(1))
      }, 100)
    } else {
      clearInterval(timerRef.current)
      setElapsed('0.0')
    }
    return () => clearInterval(timerRef.current)
  }, [thinking])

  const bCaps = captures?.['1'] ?? 0
  const wCaps = captures?.['2'] ?? 0
  const blackScore = score?.black_score ?? 0
  const whiteScore = score?.white_score ?? 2.5
  const leader = blackScore > whiteScore ? 'Black' : whiteScore > blackScore ? 'White' : 'Even'

  return (
    <>
      <div className="panel-card">
        <div className="panel-card-header">Turn</div>
        <div className="turn-line">
          <Stone color={currentPlayer} size={14} />
          <span className={thinking ? 'thinking-text soft-pulse' : 'player-name'}>
            {thinking ? 'Thinking...' : currentPlayer === 1 ? 'Black' : 'White'}
          </span>
          <span className="turn-timer mono">{thinking ? `${elapsed}s` : '0:00.0'}</span>
        </div>
      </div>

      <div className="panel-card move-phase-card">
        <div>
          <div className="panel-card-header">Move</div>
          <div className="large-value">{moveNumber}</div>
        </div>
        <div>
          <div className="panel-card-header">Phase</div>
          <div className="phase-value">
            <span className="phase-dot" style={{ background: currentPhase.color }} />
            {currentPhase.label}
          </div>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-card-header">Captured</div>
        <div className="capture-row">
          <Stone color={1} size={12} />
          <span>Black</span>
          <MiniStones color={1} count={bCaps} />
          <strong>{bCaps}</strong>
        </div>
        <div className="capture-row">
          <Stone color={2} size={12} />
          <span>White</span>
          <MiniStones color={2} count={wCaps} />
          <strong>{wCaps}</strong>
        </div>
      </div>

      <div className="panel-card">
        <div className="panel-card-header">Score</div>
        <div className="score-grid">
          <div>
            <div className="score-label">Black</div>
            <div className={`score-value ${leader === 'Black' ? 'leading' : ''}`}>{blackScore}</div>
            <div className="score-detail">{score?.black_stones ?? 0} stones</div>
            <div className="score-detail">{score?.black_territory ?? 0} territory</div>
          </div>
          <div>
            <div className="score-label">White</div>
            <div className={`score-value ${leader === 'White' ? 'leading' : ''}`}>{whiteScore}</div>
            <div className="score-detail">{score?.white_stones ?? 0} stones</div>
            <div className="score-detail">{score?.white_territory ?? 0} territory</div>
          </div>
        </div>
        <div className="score-footer">
          Komi: 2.5 <span>Lead: {leader === 'Even' ? 'Even' : leader[0]}</span>
        </div>
      </div>
    </>
  )
}
