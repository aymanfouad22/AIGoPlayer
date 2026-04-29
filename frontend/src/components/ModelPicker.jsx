import { useState, useEffect } from 'react'
import { useGame } from '../hooks/useGame'

export default function ModelPicker({ aiType }) {
  const { fetchModels, loadModel } = useGame()
  const [models, setModels]         = useState([])
  const [selected, setSelected]     = useState('')
  const [status, setStatus]         = useState(null)
  const [loading, setLoading]       = useState(false)

  useEffect(() => {
    fetchModels().then(data => {
      setModels(data.models)
      const gpu = data.models.find(m => m.name === 'go_cnn_gpu.pth')
      if (gpu) setSelected(gpu.path)
    }).catch(() => {})
  }, [])

  const handleLoad = async () => {
    if (!selected) return
    setLoading(true)
    setStatus(null)
    try {
      const res = await loadModel(selected)
      setStatus({ ok: true, msg: `Loaded: ${res.loaded}` })
    } catch (e) {
      setStatus({ ok: false, msg: e.message })
    } finally {
      setLoading(false)
    }
  }

  if (aiType !== 'cnn') return null

  return (
    <div className="flex flex-col gap-1.5 bg-coffee-800 border border-coffee-600 rounded-lg px-3 py-2">
      <span className="text-xs text-cream-400" style={{ fontFamily: "'Cinzel', serif" }}>CNN Model</span>
      <div className="flex gap-2 items-center">
        <select
          value={selected}
          onChange={e => { setSelected(e.target.value); setStatus(null) }}
          className="flex-1 bg-coffee-700 text-cream-200 text-sm rounded px-2 py-1.5 border border-coffee-600 focus:outline-none focus:border-goldwood-500"
        >
          {models.map(m => (
            <option key={m.path} value={m.path}>{m.name}</option>
          ))}
        </select>
        <button
          onClick={handleLoad}
          disabled={loading || !selected}
          className="px-3 py-1.5 rounded bg-goldwood-500 hover:bg-goldwood-400 text-coffee-950 text-sm font-semibold transition-colors disabled:opacity-50"
        >
          {loading ? '…' : 'Load'}
        </button>
      </div>
      {status && (
        <span className={`text-sm ${status.ok ? 'text-goldwood-300' : 'text-red-400'}`}>
          {status.msg}
        </span>
      )}
    </div>
  )
}
