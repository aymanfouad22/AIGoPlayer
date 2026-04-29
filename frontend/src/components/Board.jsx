import React, { useCallback, useMemo, useRef, useState } from 'react'
import '../styles/board.css'

const CELL = 60
const MARGIN = 40
const SIZE = MARGIN * 2 + CELL * 8
const STONE_R = CELL / 2 - 4
const HOSHI = [[2, 2], [2, 6], [6, 2], [6, 6], [4, 4]]
const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J']

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
      my: (e.clientY - rect.top) * (SIZE / rect.height),
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

  const ghostVisible =
    hover &&
    !thinking &&
    board[hover[0]]?.[hover[1]] === 0 &&
    legalSet.has(`${hover[0]},${hover[1]}`)

  return (
    <div className="board-container">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
        onClick={onClick}
        style={{ cursor: thinking ? 'wait' : ghostVisible ? 'pointer' : 'default' }}
      >
        <defs>
          <radialGradient id="gB" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#333" />
            <stop offset="100%" stopColor="#111" />
          </radialGradient>
          <radialGradient id="gW" cx="35%" cy="30%">
            <stop offset="0%" stopColor="#FAFAFA" />
            <stop offset="100%" stopColor="#E0DDD8" />
          </radialGradient>
          <linearGradient id="gWood" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#D4A464" />
            <stop offset="50%" stopColor="#C99B52" />
            <stop offset="100%" stopColor="#D4A464" />
          </linearGradient>
          <filter id="fBlackShadow">
            <feDropShadow dx="1" dy="2" stdDeviation="2" floodOpacity="0.5" />
          </filter>
          <filter id="fWhiteShadow">
            <feDropShadow dx="1" dy="2" stdDeviation="1.5" floodOpacity="0.15" />
          </filter>
        </defs>

        <rect x={0} y={0} width={SIZE} height={SIZE} fill="url(#gWood)" rx={8} />
        <rect x={1} y={1} width={SIZE - 2} height={SIZE - 2} fill="none" stroke="rgba(255,255,255,0.1)" rx={8} />

        {Array.from({ length: 9 }, (_, i) => (
          <React.Fragment key={i}>
            <line
              x1={MARGIN}
              y1={MARGIN + i * CELL}
              x2={MARGIN + 8 * CELL}
              y2={MARGIN + i * CELL}
              stroke="#A67B3D"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
            <line
              x1={MARGIN + i * CELL}
              y1={MARGIN}
              x2={MARGIN + i * CELL}
              y2={MARGIN + 8 * CELL}
              stroke="#A67B3D"
              strokeWidth={1}
              shapeRendering="crispEdges"
            />
          </React.Fragment>
        ))}

        {HOSHI.map(([r, c]) => {
          const p = xy(r, c)
          return <circle key={`h${r}${c}`} cx={p.x} cy={p.y} r={4} fill="#A67B3D" />
        })}

        {Array.from({ length: 9 }, (_, i) => (
          <React.Fragment key={`lbl${i}`}>
            <text x={MARGIN + i * CELL} y={MARGIN - 14} textAnchor="middle" fontSize={11} fill="#A67B3D" fontFamily="JetBrains Mono,monospace">
              {COLS[i]}
            </text>
            <text x={MARGIN - 18} y={MARGIN + i * CELL + 4} textAnchor="middle" fontSize={11} fill="#A67B3D" fontFamily="JetBrains Mono,monospace">
              {9 - i}
            </text>
          </React.Fragment>
        ))}

        {showTerritory && territory.black.map(([r, c]) => {
          const p = xy(r, c)
          return (
            <g key={`tb${r}${c}`} className="overlay-fade">
              <rect x={p.x - 16} y={p.y - 16} width={32} height={32} fill="rgba(26,26,26,0.15)" rx={3} />
              <circle cx={p.x} cy={p.y} r={3} fill="#1A1A1A" opacity={0.7} />
            </g>
          )
        })}

        {showTerritory && territory.white.map(([r, c]) => {
          const p = xy(r, c)
          return (
            <g key={`tw${r}${c}`} className="overlay-fade">
              <rect x={p.x - 16} y={p.y - 16} width={32} height={32} fill="rgba(242,240,236,0.15)" rx={3} />
              <circle cx={p.x} cy={p.y} r={3} fill="none" stroke="#F2F0EC" strokeWidth={1.5} opacity={0.8} />
            </g>
          )
        })}

        {showLegalMoves && legalMoves.map(([r, c]) => {
          const p = xy(r, c)
          return <circle key={`lm${r}${c}`} className="overlay-fade" cx={p.x} cy={p.y} r={4} fill="rgba(201,123,58,0.4)" />
        })}

        {board.map((row, r) =>
          row.map((cell, c) => {
            if (!cell) return null
            const p = xy(r, c)
            const isBlack = cell === 1
            const isLast = lastMove && lastMove[0] === r && lastMove[1] === c
            return (
              <g key={`s${r}${c}`} className="stone-enter">
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={STONE_R}
                  fill={isBlack ? 'url(#gB)' : 'url(#gW)'}
                  stroke={isBlack ? 'none' : '#C8C4BC'}
                  strokeWidth={isBlack ? 0 : 0.5}
                  filter={isBlack ? 'url(#fBlackShadow)' : 'url(#fWhiteShadow)'}
                />
                {isLast && (
                  <circle className="last-move-marker" cx={p.x} cy={p.y} r={6} fill={isBlack ? '#C97B3A' : '#B85450'} opacity={0.9} />
                )}
              </g>
            )
          })
        )}

        {showAIMoves && aiTopMoves.map((m, i) => {
          const [r, c] = m.move
          if (board[r]?.[c]) return null
          const p = xy(r, c)
          return (
            <g key={`aim${i}`} className="overlay-fade">
              <title>{`${m.visits ?? 0} visits, ${Math.round((m.winrate ?? 0) * 100)}% win rate`}</title>
              <circle cx={p.x} cy={p.y} r={16} fill="#C97B3A" stroke="#E8C88A" strokeWidth={1} />
              <text x={p.x} y={p.y + 5} textAnchor="middle" fontSize={13} fontWeight="600" fill="#1A1512" fontFamily="Inter,sans-serif">
                {i + 1}
              </text>
            </g>
          )
        })}

        {ghostVisible && (() => {
          const p = xy(hover[0], hover[1])
          return (
            <circle
              cx={p.x}
              cy={p.y}
              r={STONE_R}
              fill={currentPlayer === 1 ? 'url(#gB)' : 'url(#gW)'}
              opacity={0.3}
              stroke={currentPlayer === 2 ? '#C8C4BC' : 'none'}
              strokeWidth={1}
            />
          )
        })()}

        {thinking && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={SIZE / 2 - 4}
            fill="none"
            stroke="rgba(201,123,58,0.28)"
            strokeWidth={6}
            className="thinking-indicator"
          />
        )}
      </svg>
    </div>
  )
}
