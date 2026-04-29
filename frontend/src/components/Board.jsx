import React, { useState, useCallback, useMemo, useRef } from 'react'
import '../styles/board.css'

const CELL = 60
const MARGIN = 40
const SIZE = MARGIN * 2 + CELL * 8  // 560
const STONE_R = CELL / 2 - 4        // 26
const HOSHI = [[2,2],[2,6],[6,2],[6,6],[4,4]]

function xy(row, col) {
  return { x: MARGIN + col * CELL, y: MARGIN + row * CELL }
}

function snapCell(mx, my) {
  const col = Math.round((mx - MARGIN) / CELL)
  const row = Math.round((my - MARGIN) / CELL)
  if (row >= 0 && row < 9 && col >= 0 && col < 9) return [row, col]
  return null
}

export default function Board({
  board, legalMoves = [], lastMove, currentPlayer,
  aiTopMoves = [], showTerritory, showLegalMoves, showAIMoves,
  territory = { black: [], white: [] }, onMove, thinking,
}) {
  const [hover, setHover] = useState(null)
  const svgRef = useRef(null)

  const legalSet = useMemo(() => {
    const s = new Set()
    legalMoves.forEach(([r, c]) => s.add(`${r},${c}`))
    return s
  }, [legalMoves])

  const svgCoords = useCallback((e) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      mx: (e.clientX - rect.left) * (SIZE / rect.width),
      my: (e.clientY - rect.top)  * (SIZE / rect.height),
    }
  }, [])

  const onMouseMove = useCallback((e) => {
    const c = svgCoords(e)
    if (c) setHover(snapCell(c.mx, c.my))
  }, [svgCoords])

  const onClick = useCallback((e) => {
    if (thinking) return
    const c = svgCoords(e)
    if (!c) return
    const cell = snapCell(c.mx, c.my)
    if (cell && legalSet.has(`${cell[0]},${cell[1]}`)) onMove(cell[0], cell[1])
  }, [thinking, svgCoords, legalSet, onMove])

  const ghostVisible = hover && !thinking && board[hover[0]]?.[hover[1]] === 0 && legalSet.has(`${hover[0]},${hover[1]}`)

  return (
    <div className="board-container">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
        onClick={onClick}
        style={{ cursor: thinking ? 'wait' : 'crosshair' }}
      >
        <defs>
          <radialGradient id="gB" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#777" />
            <stop offset="100%" stopColor="#111" />
          </radialGradient>
          <radialGradient id="gW" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="100%" stopColor="#ccc" />
          </radialGradient>
          <linearGradient id="gWood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#E8C87A" />
            <stop offset="55%" stopColor="#DEB887" />
            <stop offset="100%" stopColor="#C8A060" />
          </linearGradient>
          <filter id="fShadow">
            <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.45" />
          </filter>
        </defs>

        {/* Board surface */}
        <rect x={0} y={0} width={SIZE} height={SIZE} fill="url(#gWood)" rx={6} />

        {/* Grid lines */}
        {Array.from({ length: 9 }, (_, i) => (
          <React.Fragment key={i}>
            <line
              x1={MARGIN} y1={MARGIN + i * CELL}
              x2={MARGIN + 8 * CELL} y2={MARGIN + i * CELL}
              stroke="#6B4C1E" strokeWidth={i === 0 || i === 8 ? 2 : 1}
            />
            <line
              x1={MARGIN + i * CELL} y1={MARGIN}
              x2={MARGIN + i * CELL} y2={MARGIN + 8 * CELL}
              stroke="#6B4C1E" strokeWidth={i === 0 || i === 8 ? 2 : 1}
            />
          </React.Fragment>
        ))}

        {/* Star points */}
        {HOSHI.map(([r, c]) => {
          const p = xy(r, c)
          return <circle key={`h${r}${c}`} cx={p.x} cy={p.y} r={4} fill="#6B4C1E" />
        })}

        {/* Coordinate labels */}
        {Array.from({ length: 9 }, (_, i) => (
          <React.Fragment key={`lbl${i}`}>
            <text x={MARGIN + i * CELL} y={MARGIN - 14} textAnchor="middle" fontSize={11} fill="#8B6914" fontFamily="Inter,sans-serif">
              {String.fromCharCode(65 + i)}
            </text>
            <text x={MARGIN - 18} y={MARGIN + i * CELL + 4} textAnchor="middle" fontSize={11} fill="#8B6914" fontFamily="Inter,sans-serif">
              {9 - i}
            </text>
          </React.Fragment>
        ))}

        {/* Territory overlay */}
        {showTerritory && territory.black.map(([r, c]) => {
          const p = xy(r, c)
          return <rect key={`tb${r}${c}`} x={p.x - 14} y={p.y - 14} width={28} height={28} fill="rgba(0,0,0,0.38)" rx={2} />
        })}
        {showTerritory && territory.white.map(([r, c]) => {
          const p = xy(r, c)
          return <rect key={`tw${r}${c}`} x={p.x - 14} y={p.y - 14} width={28} height={28} fill="rgba(255,255,255,0.42)" rx={2} />
        })}

        {/* Legal moves dots */}
        {showLegalMoves && legalMoves.map(([r, c]) => {
          const p = xy(r, c)
          return <circle key={`lm${r}${c}`} cx={p.x} cy={p.y} r={7} fill="rgba(60,200,80,0.4)" stroke="rgba(60,200,80,0.7)" strokeWidth={1} />
        })}

        {/* Stones */}
        {board.map((row, r) =>
          row.map((cell, c) => {
            if (!cell) return null
            const p = xy(r, c)
            const isBlack = cell === 1
            const isLast = lastMove && lastMove[0] === r && lastMove[1] === c
            return (
              <g key={`s${r}${c}`} className="stone-enter">
                <circle
                  cx={p.x} cy={p.y} r={STONE_R}
                  fill={isBlack ? 'url(#gB)' : 'url(#gW)'}
                  stroke={isBlack ? 'none' : '#555'}
                  strokeWidth={isBlack ? 0 : 1.5}
                  filter="url(#fShadow)"
                />
                {isLast && (
                  <circle cx={p.x} cy={p.y} r={7} fill={isBlack ? '#ff6666' : '#4488ff'} opacity={0.85} />
                )}
              </g>
            )
          })
        )}

        {/* AI top-move markers */}
        {showAIMoves && aiTopMoves.map((m, i) => {
          const [r, c] = m.move
          if (board[r]?.[c]) return null
          const p = xy(r, c)
          return (
            <g key={`aim${i}`}>
              <circle cx={p.x} cy={p.y} r={16} fill="rgba(255,140,0,0.78)" stroke="rgba(255,190,50,0.9)" strokeWidth={1.5} />
              <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize={13} fontWeight="bold" fill="white" fontFamily="Inter,sans-serif">
                {i + 1}
              </text>
            </g>
          )
        })}

        {/* Ghost stone on hover */}
        {ghostVisible && (() => {
          const p = xy(hover[0], hover[1])
          return (
            <circle
              cx={p.x} cy={p.y} r={STONE_R}
              fill={currentPlayer === 1 ? 'rgba(30,30,30,0.42)' : 'rgba(240,240,240,0.52)'}
              stroke={currentPlayer === 2 ? '#888' : 'none'}
              strokeWidth={1}
            />
          )
        })()}

        {/* Thinking spinner ring */}
        {thinking && (
          <circle
            cx={SIZE / 2} cy={SIZE / 2} r={SIZE / 2 - 4}
            fill="none" stroke="rgba(200,150,70,0.22)" strokeWidth={6}
            className="thinking-indicator"
          />
        )}
      </svg>
    </div>
  )
}
