import { useState } from 'react'

const TIME_OPTIONS = [1, 3, 5, 10]
const OVERLAYS = [
  { key: 'territory', label: 'Territory' },
  { key: 'legalMoves', label: 'Legal' },
  { key: 'aiMoves', label: 'AI Moves' },
]
const MODES = [
  { label: 'Human vs AI', blackPlayer: 'human', whitePlayer: 'ai' },
  { label: 'AI vs Human', blackPlayer: 'ai', whitePlayer: 'human' },
  { label: 'Human vs Human', blackPlayer: 'human', whitePlayer: 'human' },
  { label: 'AI vs AI', blackPlayer: 'ai', whitePlayer: 'ai' },
]
const AI_TYPES = [
  { value: 'classic', label: 'Classic' },
  { value: 'cnn', label: 'CNN+MCTS' },
]

export default function Controls({
  onNewGame, onPass, onUndo, onOverride, onSetMode,
  blackPlayer, whitePlayer,
  aiType, onSetAIType,
  timeLimit, onTimeLimit,
  overlays, onToggleOverlay,
  thinking, gameOver, aiPassed, currentIsAI,
  moveNumber, historyLength, onHistoryPrev, onHistoryNext, onHistoryLive, viewingHistory,
}) {
  const [confirmPass, setConfirmPass] = useState(false)

  const handlePass = () => {
    if (confirmPass) {
      setConfirmPass(false)
      onPass()
    } else {
      setConfirmPass(true)
    }
  }

  return (
    <div className="control-bar">
      <div className="control-group">
        <button className="btn-action" onClick={onNewGame} disabled={thinking}>New Game</button>
        {!currentIsAI && (
          <button className="btn-action" onClick={handlePass} onBlur={() => setConfirmPass(false)} disabled={thinking || gameOver}>
            {confirmPass ? 'Confirm Pass' : 'Pass'}
          </button>
        )}
        <button className="btn-action" onClick={onUndo} disabled={thinking || moveNumber === 0}>Undo</button>
        {aiPassed && !gameOver && (
          <button className="btn-action warm-action" onClick={onOverride} disabled={thinking}>Override</button>
        )}
      </div>

      <div className="control-group">
        <span className="control-label">AI</span>
        <div className="segmented">
          {AI_TYPES.map(({ value, label }) => (
            <button key={value} className={`engine-option ${aiType === value ? 'active' : ''}`} onClick={() => onSetAIType(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        <span className="control-label">Time</span>
        <div className="segmented">
          {TIME_OPTIONS.map((t) => (
            <button key={t} className={`time-option ${timeLimit === t ? 'active' : ''}`} onClick={() => onTimeLimit(t)}>
              {t}s
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        {OVERLAYS.map(({ key, label }) => (
          <button key={key} className={`btn-toggle ${overlays[key] ? 'active' : ''}`} onClick={() => onToggleOverlay(key)}>
            {label}
          </button>
        ))}
      </div>

      <div className="control-group history-controls">
        <button className="btn-toggle square" onClick={onHistoryPrev} disabled={moveNumber === 0}>Prev</button>
        <span className={viewingHistory ? 'history-status active' : 'history-status'}>
          {viewingHistory ? `Move ${moveNumber}/${historyLength}` : `Move ${historyLength}`}
        </span>
        <button className="btn-toggle square" onClick={onHistoryNext} disabled={!viewingHistory}>Next</button>
        {viewingHistory && <button className="btn-toggle active" onClick={onHistoryLive}>Live</button>}
      </div>

      <div className="control-group mode-controls">
        {MODES.map((m) => {
          const active = m.blackPlayer === blackPlayer && m.whitePlayer === whitePlayer
          return (
            <button
              key={m.label}
              className={`mode-option ${active ? 'active' : ''}`}
              onClick={() => onSetMode(m.blackPlayer, m.whitePlayer)}
            >
              {m.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
