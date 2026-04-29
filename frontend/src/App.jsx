import { useReducer, useCallback, useEffect } from 'react'
import Board from './components/Board'
import GameInfo from './components/GameInfo'
import AIAnalysis from './components/AIAnalysis'
import MoveHistory from './components/MoveHistory'
import Controls from './components/Controls'
import ModelPicker from './components/ModelPicker'
import GameOverModal from './components/GameOverModal'
import { useGame } from './hooks/useGame'

const EMPTY_BOARD = Array(9).fill(null).map(() => Array(9).fill(0))
const BLACK = 1

const init = {
  board: EMPTY_BOARD,
  currentPlayer: BLACK,
  captures: { '1': 0, '2': 0 },
  lastMove: null,
  gameOver: false,
  moveNumber: 0,
  legalMoves: [],
  score: null,
  aiStats: null,
  aiPassed: false,
  moveHistory: [],
  territory: { black: [], white: [] },
  thinking: false,
  timeLimit: 5,
  overlays: { territory: false, legalMoves: false, aiMoves: false },
  winRateHistory: [],
  boardSnapshots: [{ board: EMPTY_BOARD, lastMove: null }],
  viewIdx: 0,
  // Mode: who controls each color — 'human' | 'ai'
  blackPlayer: 'human',
  whitePlayer: 'ai',
  aiType: 'classic',  // 'classic' | 'cnn'
  error: null,
}

function reducer(state, action) {
  switch (action.type) {

    case 'UPDATE': {
      const d = action.payload
      const winRateHistory =
        d.ai_stats?.win_probability != null
          ? [...state.winRateHistory, { move: d.move_number, winProb: d.ai_stats.win_probability }]
          : state.winRateHistory
      const snapshots = d.move_number > state.moveNumber
        ? [...state.boardSnapshots, { board: d.board, lastMove: d.last_move }]
        : state.boardSnapshots
      return {
        ...state,
        board: d.board,
        currentPlayer: d.current_player,
        captures: d.captures,
        lastMove: d.last_move,
        gameOver: d.game_over,
        moveNumber: d.move_number,
        legalMoves: d.legal_moves || [],
        score: d.score,
        aiStats: d.ai_stats !== undefined ? d.ai_stats : state.aiStats,
        aiPassed: d.ai_passed || false,
        moveHistory: d.move_history || [],
        territory: d.territory || { black: [], white: [] },
        winRateHistory,
        boardSnapshots: snapshots,
        viewIdx: snapshots.length - 1,
        thinking: false,
        error: null,
      }
    }

    case 'UNDO_UPDATE': {
      const d = action.payload
      const snapshots = state.boardSnapshots.slice(0, -1)
      return {
        ...state,
        board: d.board,
        currentPlayer: d.current_player,
        captures: d.captures,
        lastMove: d.last_move,
        gameOver: d.game_over,
        moveNumber: d.move_number,
        legalMoves: d.legal_moves || [],
        score: d.score,
        aiPassed: false,
        moveHistory: d.move_history || [],
        territory: d.territory || { black: [], white: [] },
        boardSnapshots: snapshots.length ? snapshots : [{ board: EMPTY_BOARD, lastMove: null }],
        viewIdx: Math.max(0, snapshots.length - 1),
        thinking: false,
        error: null,
      }
    }

    case 'SET_VIEW_IDX':    return { ...state, viewIdx: action.payload }
    case 'THINKING':        return { ...state, thinking: action.payload, error: null }
    case 'ERROR':           return { ...state, thinking: false, error: action.payload }
    case 'SET_TIME_LIMIT':  return { ...state, timeLimit: action.payload }
    case 'SET_MODE':        return { ...state, blackPlayer: action.blackPlayer, whitePlayer: action.whitePlayer }
    case 'SET_AI_TYPE':     return { ...state, aiType: action.payload }
    case 'TOGGLE_OVERLAY':  return { ...state, overlays: { ...state.overlays, [action.payload]: !state.overlays[action.payload] } }
    case 'RESET':           return { ...init, blackPlayer: state.blackPlayer, whitePlayer: state.whitePlayer, aiType: state.aiType, timeLimit: state.timeLimit }
    default:                return state
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, init)
  const { newGame, playMove, playAIMove, forceAIMove, pass, undo } = useGame()

  // Is the current player controlled by AI?
  const currentIsAI = state.currentPlayer === BLACK
    ? state.blackPlayer === 'ai'
    : state.whitePlayer === 'ai'

  // ── AI auto-move trigger ────────────────────────────────────────────────────
  // Fires whenever it becomes an AI player's turn (covers AI vs AI, and AI-first modes)
  useEffect(() => {
    if (state.gameOver || state.thinking || !currentIsAI) return
    // Small delay so the board visually updates before AI starts thinking
    const t = setTimeout(() => triggerAIMove(), 250)
    return () => clearTimeout(t)
  }, [state.currentPlayer, state.gameOver, state.thinking, currentIsAI])

  const triggerAIMove = useCallback(async () => {
    dispatch({ type: 'THINKING', payload: true })
    try {
      const aiData = await playAIMove(state.timeLimit, state.aiType)
      dispatch({ type: 'UPDATE', payload: aiData })
    } catch (e) {
      dispatch({ type: 'ERROR', payload: e.message })
    }
  }, [state.timeLimit, state.aiType, playAIMove])

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'z' || e.key === 'Z') handleUndo()
      if (e.key === 'ArrowLeft')  dispatch({ type: 'SET_VIEW_IDX', payload: Math.max(0, state.viewIdx - 1) })
      if (e.key === 'ArrowRight') dispatch({ type: 'SET_VIEW_IDX', payload: Math.min(state.boardSnapshots.length - 1, state.viewIdx + 1) })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.viewIdx, state.boardSnapshots.length])

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleNewGame = useCallback(async () => {
    dispatch({ type: 'RESET' })
    dispatch({ type: 'THINKING', payload: true })
    try {
      const data = await newGame()
      dispatch({ type: 'UPDATE', payload: data })
      // If Black is AI, it will fire automatically via the useEffect above
    } catch (e) {
      dispatch({ type: 'ERROR', payload: e.message })
    }
  }, [newGame])

  useEffect(() => { handleNewGame() }, [])

  const handleMove = useCallback(async (row, col) => {
    if (state.thinking || state.gameOver) return
    if (currentIsAI) return  // block clicks on AI's turn
    // Clicking while reviewing returns to live without playing
    if (state.viewIdx < state.boardSnapshots.length - 1) {
      dispatch({ type: 'SET_VIEW_IDX', payload: state.boardSnapshots.length - 1 })
      return
    }
    dispatch({ type: 'THINKING', payload: true })
    try {
      const data = await playMove(row, col)
      dispatch({ type: 'UPDATE', payload: data })
      // AI responds automatically via useEffect
    } catch (e) {
      dispatch({ type: 'ERROR', payload: e.message })
    }
  }, [state.thinking, state.gameOver, state.viewIdx, state.boardSnapshots.length, currentIsAI, playMove])

  const handlePass = useCallback(async () => {
    if (state.thinking || state.gameOver || currentIsAI) return
    dispatch({ type: 'THINKING', payload: true })
    try {
      const data = await pass()
      dispatch({ type: 'UPDATE', payload: data })
      // AI responds automatically via useEffect
    } catch (e) {
      dispatch({ type: 'ERROR', payload: e.message })
    }
  }, [state.thinking, state.gameOver, currentIsAI, pass])

  const handleUndo = useCallback(async () => {
    if (state.thinking || state.moveNumber === 0) return
    dispatch({ type: 'THINKING', payload: true })
    try {
      const data = await undo()
      dispatch({ type: 'UNDO_UPDATE', payload: data })
    } catch (e) {
      dispatch({ type: 'ERROR', payload: e.message })
    }
  }, [state.thinking, state.moveNumber, undo])

  const handleOverride = useCallback(async () => {
    if (state.thinking || state.gameOver) return
    dispatch({ type: 'THINKING', payload: true })
    try {
      const aiData = await forceAIMove(state.timeLimit, state.aiType)
      dispatch({ type: 'UPDATE', payload: aiData })
    } catch (e) {
      dispatch({ type: 'ERROR', payload: e.message })
    }
  }, [state.thinking, state.gameOver, state.timeLimit, state.aiType, forceAIMove])

  const handleSetMode = useCallback((blackPlayer, whitePlayer) => {
    dispatch({ type: 'SET_MODE', blackPlayer, whitePlayer })
    // Start a fresh game with the new mode
    setTimeout(() => handleNewGame(), 50)
  }, [handleNewGame])

  // ── Display ─────────────────────────────────────────────────────────────────
  const isViewingHistory = state.viewIdx < state.boardSnapshots.length - 1
  const displayedSnap    = state.boardSnapshots[state.viewIdx] || { board: state.board, lastMove: state.lastMove }
  const displayedBoard   = isViewingHistory ? displayedSnap.board   : state.board
  const displayedLast    = isViewingHistory ? displayedSnap.lastMove : state.lastMove

  return (
    <div className="flex h-screen bg-coffee-900 text-cream-100 overflow-hidden" style={{ fontFamily: "'EB Garamond', Georgia, serif" }}>

      {/* Left sidebar */}
      <div className="w-60 flex-shrink-0 flex flex-col gap-3 p-4 bg-coffee-800 border-r border-coffee-600 overflow-y-auto">
        <GameInfo
          currentPlayer={state.currentPlayer}
          moveNumber={state.moveNumber}
          captures={state.captures}
          score={state.score}
          thinking={state.thinking}
        />
        {state.aiPassed && !state.gameOver && (
          <div className="text-goldwood-300 text-sm bg-coffee-700 border border-coffee-500 px-3 py-2 rounded-lg">
            AI passed — no beneficial moves found.
          </div>
        )}
      </div>

      {/* Board area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4 overflow-y-auto min-h-0">

        {state.error && (
          <div className="text-red-300 text-sm bg-red-950/60 border border-red-900 px-3 py-2 rounded-lg w-full max-w-xl">
            {state.error}
          </div>
        )}

        {isViewingHistory && (
          <div className="text-cream-300 text-sm bg-coffee-700 border border-coffee-500 px-3 py-1.5 rounded-lg w-full max-w-xl text-center">
            Reviewing move {state.viewIdx} / {state.boardSnapshots.length - 1} — click board or ▶▶ Live to return
          </div>
        )}

        <Board
          board={displayedBoard}
          legalMoves={isViewingHistory ? [] : state.legalMoves}
          lastMove={displayedLast}
          currentPlayer={state.currentPlayer}
          aiTopMoves={isViewingHistory ? [] : (state.aiStats?.top_moves || [])}
          showTerritory={state.overlays.territory}
          showLegalMoves={state.overlays.legalMoves && !isViewingHistory}
          showAIMoves={state.overlays.aiMoves && !isViewingHistory}
          territory={state.territory}
          onMove={handleMove}
          thinking={state.thinking}
        />

        <Controls
          onNewGame={handleNewGame}
          onPass={handlePass}
          onUndo={handleUndo}
          onOverride={handleOverride}
          onSetMode={handleSetMode}
          blackPlayer={state.blackPlayer}
          whitePlayer={state.whitePlayer}
          aiType={state.aiType}
          onSetAIType={(t) => dispatch({ type: 'SET_AI_TYPE', payload: t })}
          timeLimit={state.timeLimit}
          onTimeLimit={(v) => dispatch({ type: 'SET_TIME_LIMIT', payload: v })}
          overlays={state.overlays}
          onToggleOverlay={(k) => dispatch({ type: 'TOGGLE_OVERLAY', payload: k })}
          thinking={state.thinking}
          gameOver={state.gameOver}
          aiPassed={state.aiPassed}
          currentIsAI={currentIsAI}
          moveNumber={state.viewIdx}
          historyLength={state.boardSnapshots.length - 1}
          viewingHistory={isViewingHistory}
          onHistoryPrev={() => dispatch({ type: 'SET_VIEW_IDX', payload: Math.max(0, state.viewIdx - 1) })}
          onHistoryNext={() => dispatch({ type: 'SET_VIEW_IDX', payload: Math.min(state.boardSnapshots.length - 1, state.viewIdx + 1) })}
          onHistoryLive={() => dispatch({ type: 'SET_VIEW_IDX', payload: state.boardSnapshots.length - 1 })}
        />
        <ModelPicker aiType={state.aiType} />
      </div>

      {/* Right sidebar */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-3 p-4 bg-coffee-800 border-l border-coffee-600 overflow-y-auto">
        <AIAnalysis aiStats={state.aiStats} thinking={state.thinking} />
        <MoveHistory moveHistory={state.moveHistory} winRateHistory={state.winRateHistory} />
      </div>

      {state.gameOver && state.score && (
        <GameOverModal
          score={state.score}
          moveHistory={state.moveHistory}
          onNewGame={handleNewGame}
        />
      )}
    </div>
  )
}
