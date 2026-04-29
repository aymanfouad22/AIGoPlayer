const API = '/api'

async function request(path, method = 'GET', body = undefined) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(API + path, opts)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || 'Request failed')
  }
  return res.json()
}

export function useGame() {
  const newGame       = ()                           => request('/new-game',       'POST')
  const playMove      = (row, col)                   => request('/move',           'POST', { row, col })
  const playAIMove    = (time_limit=5, ai_type='classic') => request('/ai-move',   'POST', { time_limit, ai_type })
  const forceAIMove   = (time_limit=5, ai_type='classic') => request('/ai-move-force', 'POST', { time_limit, ai_type })
  const pass          = ()                           => request('/pass',            'POST')
  const undo          = ()                           => request('/undo',            'POST')
  const fetchState    = ()                           => request('/state')
  const fetchModels   = ()                           => request('/models')
  const loadModel     = (path)                       => request('/load-model',      'POST', { path })
  return { newGame, playMove, playAIMove, forceAIMove, pass, undo, fetchState, fetchModels, loadModel }
}
