```
  ┌─────────────────────────────────────────┐
  │  ⚫  9 × 9   G O   E N G I N E   ⚪  │
  └─────────────────────────────────────────┘
```

A playable 9×9 Go game powered by two AI engines — a classical C++ MCTS and a
deep-learning CNN+MCTS — served through a FastAPI backend and a React frontend.

---

## ┌── Getting Started ───────────────────────────────────────────────────────┐

### Prerequisites
- **Python 3.14** — the compiled `.pyd` engine is built for CPython 3.14
- **Node.js 18+** — for the frontend
- **NVIDIA GPU + CUDA** — required for CNN mode; Classic runs on CPU only

### Launch

Double-click **`start.bat`**, or run each piece manually:

```bat
:: Backend
cd backend
<path-to-venv>\Scripts\uvicorn.exe server:app --host 0.0.0.0 --port 8000

:: Frontend (separate terminal)
cd frontend
npm install
npm start
```

Open **http://localhost:3000**

## └──────────────────────────────────────────────────────────────────────────┘

---

## ┌── How to Play ───────────────────────────────────────────────────────────┐

```
     A   B   C   D   E   F   G   H   J
  9  ·   ·   ·   ·   ·   ·   ·   ·   ·
  8  ·   ·   ·   ·   ·   ·   ·   ·   ·
  7  ·   ·   ⚫  ·   ·   ·   ⚪  ·   ·
  6  ·   ·   ·   ·   ·   ·   ·   ·   ·
  5  ·   ·   ·   ·   ·   ·   ·   ·   ·
  4  ·   ·   ·   ·   ·   ·   ·   ·   ·
  3  ·   ·   ⚪  ·   ·   ·   ⚫  ·   ·
  2  ·   ·   ·   ·   ·   ·   ·   ·   ·
  1  ·   ·   ·   ·   ·   ·   ·   ·   ·
```

| Action | How |
|--------|-----|
| Place a stone | Click any intersection |
| Let AI play | Click **AI Move** |
| Switch AI engine | Toggle **Classic** / **CNN** in the top bar |
| Control think time | Click **1s / 3s / 5s / 10s** |
| Pass | **Pass** button |
| Take back | **Undo** button |
| Reset | **New Game** button |

Game ends after **two consecutive passes**. Territory and score are shown live.

## └──────────────────────────────────────────────────────────────────────────┘

---

## ┌── Project Structure ─────────────────────────────────────────────────────┐

```
go_ship/
├── start.bat
├── backend/
│   ├── server.py                      ← FastAPI — all HTTP endpoints
│   ├── go_engine.cp314-win_amd64.pyd  ← Compiled C++ engine
│   ├── go_cnn_gpu.pth                 ← Trained CNN weights (iter 30)
│   ├── cnn_agent.py                   ← CNN inference wrapper
│   ├── train_gpu_local.py             ← Network definition + input encoding
│   ├── game.py / board.py / rules.py / score.py / ai.py
│   └── requirements.txt
├── cpp_engine/                        ← C++ source (rebuild the .pyd here)
│   └── src/
└── frontend/                          ← React + Vite + Tailwind
    └── src/
```

### API Reference

| Method | Endpoint | Body |
|--------|----------|------|
| POST | `/api/new-game` | — |
| POST | `/api/move` | `{ row, col }` |
| POST | `/api/ai-move` | `{ time_limit, ai_type }` |
| POST | `/api/ai-move-force` | `{ time_limit, ai_type }` |
| POST | `/api/pass` | — |
| POST | `/api/undo` | — |
| GET  | `/api/state` | — |
| GET  | `/api/score` | — |
| GET  | `/api/models` | — |
| POST | `/api/load-model` | `{ path }` |

## └──────────────────────────────────────────────────────────────────────────┘

---

## ┌── ⚫ Classic MCTS (C++ Engine) ──────────────────────────────────────────┐

A fully self-contained C++ implementation compiled as a Python extension.
The Python GIL is released for the entire search — Python overhead is zero.

### Algorithm: Select → Expand → Rollout → Backpropagate

**Selection — UCT-RAVE**

Each node is scored using a blend of standard MCTS Q-value and RAVE (Rapid
Action Value Estimation), a Fuego paper technique:

```
β  =  rave_n / (rave_n + n + rave_n·n / RAVE_EQUIV)

score  =  (1 − β)·Q_mcts  +  β·Q_rave  +  C_UCT · P · √N / (1 + n)
```

- `RAVE_EQUIV = 3000` (Fuego tuning constant)
- `C_UCT = 2.0`
- `P` is a heuristic prior set at expansion time

RAVE works by updating ancestor nodes with every move observed in the rollout,
giving much better early estimates with few simulations.

**Expansion — Heuristic Priors**

At expansion, each child receives a prior `P` from hand-coded heuristics:

- ⚫ Captures (taking opponent stones) — large bonus
- 🛡 Saving own stones in atari (1 liberty left) — large bonus
- Moves adjacent to existing stones preferred over isolated ones
- Eye-filling moves penalized

Scores are normalized and blended at 25% weight with a uniform prior.

**Rollout — Smart Rollout**

Random rollouts use urgency heuristics rather than pure random:

1. An **atari mask** is precomputed once per step via heap-free BFS
   (`get_atari_liberty_mark`), finding all capture / save moves in O(groups).
2. If urgent moves exist, one is sampled from them.
3. Otherwise a random non-eye legal move is chosen.
4. ~95% of legality checks skip the board copy via an empty-neighbor fast path.

**Backpropagation**

Results propagate up the tree, flipping sign at each level. Both tree-path
moves and all rollout moves update RAVE tables of every ancestor node.

**Performance:** ~3,000 simulations/second · 5s → ~16,000 simulations/move

## └──────────────────────────────────────────────────────────────────────────┘

---

## ┌── ⚪ CNN + MCTS (Deep Learning Engine) ─────────────────────────────────┐

The CNN engine replaces rollouts with a neural network that outputs a **policy**
(move probabilities) and a **value** (win estimate). This is the AlphaZero
approach — one network forward pass replaces thousands of random rollouts.

### Network Architecture — GoNet

```
  Input  10 × 9 × 9
     │
     ▼
  Stem   Conv2d(10 → 192, 3×3, pad=1) → BatchNorm → ReLU
     │
     ▼
  Tower  10 × ResBlock(192 filters)
     │      each: Conv→BN→ReLU→Conv→BN + residual skip → ReLU
     │
     ├──── Policy Head
     │       Conv2d(192→2, 1×1) → BN → ReLU → Flatten → Linear(162 → 81)
     │       Output: logits over 81 cells  →  softmax  →  move probabilities
     │
     └──── Value Head
             Conv2d(192→1, 1×1) → BN → ReLU → Flatten
             → Linear(81→64) → ReLU → Linear(64→1) → Tanh
             Output: scalar in [−1, +1]   (+1 = win, −1 = loss)

  Parameters: 6,679,962
```

### Input Planes — 10 Channels

| # | Plane |
|---|-------|
| 0 | ⚫ Current player's stones |
| 1 | ⚪ Opponent's stones |
| 2 | All ones (global bias) |
| 3 | Fill ratio — stone count / 81, broadcast to 9×9 |
| 4 | ⚫ Own stones with exactly 1 liberty (in atari — critical!) |
| 5 | ⚫ Own stones with exactly 2 liberties |
| 6 | ⚫ Own stones with 3+ liberties |
| 7 | ⚪ Opponent stones with exactly 1 liberty (can be captured) |
| 8 | ⚪ Opponent stones with exactly 2 liberties |
| 9 | ⚪ Opponent stones with 3+ liberties |

Liberty planes give the network direct visibility into tactical threats — atari
captures and escapes — without having to infer them from raw stone positions.

### Search — PUCT

```
score(child)  =  Q(child)  +  C_PUCT · P(child) · √N_parent / (1 + N_child)
```

`P(child)` is the network's policy output for that move. The value head
replaces rollouts entirely — the network evaluates leaves directly.

### Opening Book

Fixed joseki for the first moves avoid wasting search budget on positions where
theory is already well-established.

### Training — AlphaZero Self-Play

```
  ┌──────────────────────────────────────────┐
  │  Current network                         │
  │       ↓                                  │
  │  Self-play games  (MCTS-guided moves)    │
  │       ↓                                  │
  │  Store: (planes, visit_dist, outcome)    │
  │       ↓                                  │
  │  Train on:                               │
  │    policy loss — KL(predicted, MCTS)     │
  │    value  loss — MSE(predicted, outcome) │
  │       ↓                                  │
  │  Updated network  →  repeat              │
  └──────────────────────────────────────────┘
```

The shipped model (`go_cnn_gpu.pth`) is **iteration 30** of this loop.

### Strength

In a 100-game evaluation:

```
  CNN+MCTS  200 sims   vs   Classic MCTS  400 sims
  ─────────────────────────────────────────────────
  Game 1   ⚫ CNN   79 – 4  ⚪ Classic    CNN WIN
  Game 2   ⚪ CNN    0 – 84 ⚫ Classic    CNN WIN
  Game 3   ⚫ CNN   81 – 2  ⚪ Classic    CNN WIN
  ...
  Result: CNN wins 100 / 100  (complete sweep)
```

CNN at **200 sims** dominated Classic at **400 sims** by massive margins.
The value network's positional understanding makes rollout-based search
obsolete at any equal time budget.

## └──────────────────────────────────────────────────────────────────────────┘

---

## ┌── Configuration ─────────────────────────────────────────────────────────┐

All tunable constants live in `backend/server.py`:

| Constant | Default | Effect |
|----------|---------|--------|
| `CNN_BATCH` | 50 | GPU forward passes per batch |
| `CLASSIC_BATCH` | 200 | C++ simulations per time-check batch |
| `CLASSIC_SIMS_MIN` | 200 | Minimum sims regardless of time limit |

Frontend time buttons (1s / 3s / 5s / 10s) set wall-clock think time for
both engines. CNN runs ~200 sims/s; Classic runs ~3,000 sims/s.

## └──────────────────────────────────────────────────────────────────────────┘
