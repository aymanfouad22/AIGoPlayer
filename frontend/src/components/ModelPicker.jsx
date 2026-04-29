import { useEffect, useState } from 'react'
import { useGame } from '../hooks/useGame'

export default function ModelPicker({ aiType }) {
  const { fetchModels, loadModel } = useGame()
  const [models, setModels] = useState([])
  const [selected, setSelected] = useState('')
  const [status, setStatus] = useState(null)
  const [loading, setLoading] = useState(false)

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
    <div className="model-picker panel-card">
      <span className="panel-card-header">CNN Model</span>
      <div className="model-picker-row">
        <select
          value={selected}
          onChange={e => { setSelected(e.target.value); setStatus(null) }}
          className="model-select"
        >
          {models.map(m => (
            <option key={m.path} value={m.path}>{m.name}</option>
          ))}
        </select>
        <button className="btn-action" onClick={handleLoad} disabled={loading || !selected}>
          {loading ? '...' : 'Load'}
        </button>
      </div>
      {status && <span className={status.ok ? 'model-status ok' : 'model-status bad'}>{status.msg}</span>}
    </div>
  )
}
