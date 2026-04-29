import { useCallback, useEffect, useReducer } from 'react'
import AIAnalysis from './components/AIAnalysis'
import Board from './components/Board'
import Controls from './components/Controls'
import GameInfo from './components/GameInfo'
import GameOverModal from './components/GameOverModal'
import ModelPicker from './components/ModelPicker'
import MoveHistory from './components/MoveHistory'
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
  blackPlayer: 'human',
  whitePlayer: 'ai',
  aiType: 'classic',
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
    case 'SET_VIEW_IDX': return { ...state, viewIdx: action.payload }
    case 'THINKING': return { ...state, thinking: action.payload, error: null }
    case 'ERROR': return { ...state, thinking: false, error: action.payload }
    case 'SET_TIME_LIMIT': return { ...state, timeLimit: action.payload }
    case 'SET_MODE': return { ...state, blackPlayer: action.blackPlayer, whitePlayer: action.whitePlayer }
    case 'SET_AI_TYPE': return { ...state, aiType: action.payload }
    case 'TOGGLE_OVERLAY': return { ...state, overlays: { ...state.overlays, [action.payload]: !state.overlays[action.payload] } }
    case 'RESET': return { ...init, blackPlayer: state.blackPlayer, whitePlayer: state.whitePlayer, aiType: state.aiType, timeLimit: state.timeLimit }
    default: return state
  }
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, init)
  const { newGame, playMove, playAIMove, forceAIMove, pass, undo } = useGame()

  const currentIsAI = state.currentPlayer === BLACK
    ? state.blackPlayer === 'ai'
    : state.whitePlayer === 'ai'

  const triggerAIMove = useCallback(async () => {
    dispatch({ type: 'THINKING', payload: true })
    try {
      const aiData = await playAIMove(state.timeLimit, state.aiType)
      dispatch({ type: 'UPDATE', payload: aiData })
    } catch (e) {
      dispatch({ type: 'ERROR', payload: e.message })
    }
  }, [state.timeLimit, state.aiType, playAIMove])

  useEffect(() => {
    if (state.gameOver || state.thinking || !currentIsAI) return undefined
    const t = setTimeout(() => triggerAIMove(), 250)
    return () => clearTimeout(t)
  }, [state.currentPlayer, state.gameOver, state.thinking, currentIsAI])

  const handleNewGame = useCallback(async () => {
    dispatch({ type: 'RESET' })
    dispatch({ type: 'THINKING', payload: true })
    try {
      const data = await newGame()
      dispatch({ type: 'UPDATE', payload: data })
    } catch (e) {
      dispatch({ type: 'ERROR', payload: e.message })
    }
  }, [newGame])

  useEffect(() => { handleNewGame() }, [])

  const handleMove = useCallback(async (row, col) => {
    if (state.thinking || state.gameOver || currentIsAI) return
    if (state.viewIdx < state.boardSnapshots.length - 1) {
      dispatch({ type: 'SET_VIEW_IDX', payload: state.boardSnapshots.length - 1 })
      return
    }
    dispatch({ type: 'THINKING', payload: true })
    try {
      const data = await playMove(row, col)
      dispatch({ type: 'UPDATE', payload: data })
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
    setTimeout(() => handleNewGame(), 50)
  }, [handleNewGame])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'z' || e.key === 'Z') handleUndo()
      if (e.key === 'ArrowLeft') dispatch({ type: 'SET_VIEW_IDX', payload: Math.max(0, state.viewIdx - 1) })
      if (e.key === 'ArrowRight') dispatch({ type: 'SET_VIEW_IDX', payload: Math.min(state.boardSnapshots.length - 1, state.viewIdx + 1) })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [state.viewIdx, state.boardSnapshots.length, handleUndo])

  const isViewingHistory = state.viewIdx < state.boardSnapshots.length - 1
  const displayedSnap = state.boardSnapshots[state.viewIdx] || { board: state.board, lastMove: state.lastMove }
  const displayedBoard = isViewingHistory ? displayedSnap.board : state.board
  const displayedLast = isViewingHistory ? displayedSnap.lastMove : state.lastMove

  return (
    <div className="app-shell">
      <aside className="left-panel">
        <GameInfo
          currentPlayer={state.currentPlayer}
          moveNumber={state.moveNumber}
          captures={state.captures}
          score={state.score}
          thinking={state.thinking}
        />
        {state.aiPassed && !state.gameOver && (
          <div className="status-note">AI passed - no beneficial moves found.</div>
        )}
      </aside>

      <main className="center-area">
        {state.error && <div className="error-note">{state.error}</div>}
        {isViewingHistory && (
          <div className="review-note">Reviewing move {state.viewIdx} / {state.boardSnapshots.length - 1}</div>
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
      </main>

      <aside className="right-panel">
        <AIAnalysis aiStats={state.aiStats} thinking={state.thinking} />
        <MoveHistory moveHistory={state.moveHistory} winRateHistory={state.winRateHistory} />
      </aside>

      {state.gameOver && state.score && (
        <GameOverModal score={state.score} moveHistory={state.moveHistory} onNewGame={handleNewGame} />
      )}
    </div>
  )
}
