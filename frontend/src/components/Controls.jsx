import { useState } from 'react'

const TIME_OPTIONS = [1, 3, 5, 10]

const OVERLAYS = [
  { key: 'territory',  label: 'Territory'   },
  { key: 'legalMoves', label: 'Legal Moves' },
  { key: 'aiMoves',    label: 'AI Moves'    },
]

const MODES = [
  { label: 'Human vs AI',    blackPlayer: 'human', whitePlayer: 'ai',    desc: 'You play Black' },
  { label: 'AI vs Human',    blackPlayer: 'ai',    whitePlayer: 'human', desc: 'You play White' },
  { label: 'Human vs Human', blackPlayer: 'human', whitePlayer: 'human', desc: '2 players'      },
  { label: 'AI vs AI',       blackPlayer: 'ai',    whitePlayer: 'ai',    desc: 'Watch AI play'  },
]

const AI_TYPES = [
  { value: 'classic', label: 'Classic MCTS' },
  { value: 'cnn',     label: 'CNN+MCTS'     },
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
    if (confirmPass) { setConfirmPass(false); onPass() }
    else setConfirmPass(true)
  }

  return (
    <div className="flex flex-col gap-2.5 w-full max-w-xl">

      {/* ── Row 1: Mode selector ─────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 justify-center flex-wrap">
        {MODES.map((m) => {
          const isActive = m.blackPlayer === blackPlayer && m.whitePlayer === whitePlayer
          return (
            <button
              key={m.label}
              onClick={() => onSetMode(m.blackPlayer, m.whitePlayer)}
              title={m.desc}
              className={`px-3 py-1 rounded-md text-sm transition-colors ${
                isActive
                  ? 'bg-goldwood-400 text-coffee-950 font-semibold'
                  : 'bg-coffee-700 text-cream-300 hover:text-cream-100 hover:bg-coffee-600 border border-coffee-600'
              }`}
            >
              {m.label}
            </button>
          )
        })}
      </div>

      {/* ── Row 2: main actions ──────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 justify-center">

        <button
          onClick={onNewGame}
          className="px-5 py-2 rounded-lg bg-goldwood-400 hover:bg-goldwood-300 text-coffee-950 font-semibold text-sm transition-colors disabled:opacity-40"
          disabled={thinking}
        >
          New Game
        </button>

        {!currentIsAI && (
          <button
            onClick={handlePass}
            onBlur={() => setConfirmPass(false)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-40 ${
              confirmPass
                ? 'bg-red-800 hover:bg-red-700 text-cream-100'
                : 'bg-coffee-700 hover:bg-coffee-600 text-cream-200 border border-coffee-600'
            }`}
            disabled={thinking || gameOver}
          >
            {confirmPass ? 'Confirm Pass?' : 'Pass'}
          </button>
        )}

        <button
          onClick={onUndo}
          className="px-4 py-2 rounded-lg bg-coffee-700 hover:bg-coffee-600 text-cream-200 border border-coffee-600 text-sm font-medium transition-colors disabled:opacity-40"
          disabled={thinking || moveNumber === 0}
        >
          Undo
        </button>

        {aiPassed && !gameOver && (
          <button
            onClick={onOverride}
            className="px-4 py-2 rounded-lg bg-goldwood-600 hover:bg-goldwood-500 text-cream-100 text-sm font-medium transition-colors animate-pulse"
            disabled={thinking}
          >
            Override AI Pass
          </button>
        )}
      </div>

      {/* ── Row 3: history navigation ────────────────────────────────────── */}
      <div className="flex items-center gap-2 justify-center">
        <button
          onClick={onHistoryPrev}
          disabled={moveNumber === 0}
          className="w-8 h-8 rounded-md bg-coffee-700 hover:bg-coffee-600 text-cream-200 text-sm disabled:opacity-30 transition-colors border border-coffee-600"
        >
          ◀
        </button>

        <span className={`text-sm px-3 py-1 rounded-md ${viewingHistory ? 'bg-coffee-600 text-goldwood-300' : 'text-cream-400'}`}>
          {viewingHistory ? `Move ${moveNumber} / ${historyLength}  (reviewing)` : `Move ${historyLength}`}
        </span>

        <button
          onClick={onHistoryNext}
          disabled={!viewingHistory}
          className="w-8 h-8 rounded-md bg-coffee-700 hover:bg-coffee-600 text-cream-200 text-sm disabled:opacity-30 transition-colors border border-coffee-600"
        >
          ▶
        </button>

        {viewingHistory && (
          <button
            onClick={onHistoryLive}
            className="px-3 py-1 rounded-md bg-goldwood-500 hover:bg-goldwood-400 text-coffee-950 text-sm font-semibold transition-colors"
          >
            ▶▶ Live
          </button>
        )}
      </div>

      {/* ── Row 4: AI engine + time + overlays ──────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2 justify-center">

        <div className="flex items-center gap-1 bg-coffee-800 border border-coffee-600 rounded-lg px-2 py-1.5">
          <span className="text-xs text-cream-400 mr-1" style={{ fontFamily: "'Cinzel', serif" }}>Engine:</span>
          {AI_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => onSetAIType(value)}
              className={`px-2 py-0.5 rounded text-sm transition-colors ${
                aiType === value
                  ? 'bg-goldwood-400 text-coffee-950 font-semibold'
                  : 'text-cream-400 hover:text-cream-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-coffee-800 border border-coffee-600 rounded-lg px-2 py-1.5">
          <span className="text-xs text-cream-400 mr-1" style={{ fontFamily: "'Cinzel', serif" }}>Time:</span>
          {TIME_OPTIONS.map((t) => (
            <button
              key={t}
              onClick={() => onTimeLimit(t)}
              className={`px-2 py-0.5 rounded text-sm transition-colors ${
                timeLimit === t ? 'bg-goldwood-400 text-coffee-950 font-semibold' : 'text-cream-400 hover:text-cream-200'
              }`}
            >
              {t}s
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 bg-coffee-800 border border-coffee-600 rounded-lg px-2 py-1.5">
          {OVERLAYS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => onToggleOverlay(key)}
              className={`px-2 py-0.5 rounded text-sm transition-colors ${
                overlays[key] ? 'bg-goldwood-600 text-cream-100 font-semibold' : 'text-cream-400 hover:text-cream-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

    </div>
  )
}
