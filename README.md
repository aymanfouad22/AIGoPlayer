# 9x9 Go Engine

A playable 9x9 Go game with a FastAPI backend, a React frontend, and two AI engines:

- **Classic MCTS**: C++ Monte Carlo Tree Search engine exposed to Python.
- **CNN + MCTS**: a trained neural-network policy/value model combined with MCTS.

The easiest cross-platform way to run the project is Docker.

---

## Requirements

### Required for Docker

- Docker Desktop
- Docker Compose, included with modern Docker Desktop installs
- About 4-6 GB of free disk space for Python, Node, PyTorch, and build layers

Docker is recommended for **Windows, macOS, and Linux** because it builds the C++ engine inside the container.

### Required for local Windows development

- Windows
- Python matching the compiled extension if using the shipped `.pyd`
- Node.js 18+
- `npm`
- Backend dependencies from `backend/requirements.txt`

The shipped native backend includes:

```text
backend/go_engine.cp314-win_amd64.pyd
```

That file is a **Windows CPython extension**. It will not load natively on macOS.

### macOS note

On a Mac, do **not** use `start.bat`. Batch files are Windows-only.

Use Docker instead:

```bash
docker compose up --build
```

If you want to run natively on macOS, you must rebuild the C++ engine for macOS and produce a compatible `.so` extension. The trained model file `backend/go_cnn_gpu.pth` is portable, but the compiled engine file is not.

---

## Run With Docker

From the project root:

```bash
git clone https://github.com/aymanfouad22/AIGoPlayer.git
cd AIGoPlayer
docker compose up --build
```

Then open:

```text
http://localhost:3000
```

The frontend container serves the React app through nginx and proxies API calls to the backend container.

Backend API:

```text
http://localhost:8000
```

Stop the app with:

```bash
docker compose down
```

### Docker AI notes

The Docker backend builds the C++ engine for Linux and installs the CPU PyTorch wheel. Classic MCTS works normally. CNN mode can run, but without GPU acceleration it may be slower than on a CUDA Windows machine.

---

## Run on Windows With `start.bat`

`start.bat` is only for Windows.

Double-click:

```text
start.bat
```

Or run it from Command Prompt:

```bat
start.bat
```

It starts:

- Backend on `http://localhost:8000`
- Frontend on `http://localhost:3000`

Important: the current `start.bat` contains a hard-coded virtual environment path. If that path does not exist on your machine, edit the file and replace it with your own `uvicorn.exe` path, or run the backend manually.

---

## Run Manually for Development

### Backend

From the project root:

```bash
cd backend
pip install -r requirements.txt
uvicorn server:app --host 0.0.0.0 --port 8000
```

On Windows, if `uvicorn` is inside a virtual environment:

```bat
cd backend
.\.venv\Scripts\uvicorn.exe server:app --host 0.0.0.0 --port 8000
```

### Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually:

```text
http://localhost:5173
```

For the production Docker/nginx setup, use:

```text
http://localhost:3000
```

---

## How to Play

- Click a legal board intersection to place a stone.
- Use **New Game** to reset.
- Use **Pass** to pass your turn.
- Use **Undo** to take back a move.
- Choose **Classic** or **CNN+MCTS** from the AI selector.
- Choose AI think time with **1s**, **3s**, **5s**, or **10s**.
- Toggle territory, legal moves, and AI move overlays from the control bar.

The game ends after two consecutive passes. Score and territory are shown live.

---

## Project Structure

```text
go_ship/
|-- docker-compose.yml
|-- start.bat
|-- backend/
|   |-- server.py
|   |-- ai.py
|   |-- cnn_agent.py
|   |-- train_gpu_local.py
|   |-- go_engine.cp314-win_amd64.pyd
|   |-- go_cnn_gpu.pth
|   |-- board.py / game.py / rules.py / score.py
|   `-- requirements.txt
|-- cpp_engine/
|   |-- CMakeLists.txt
|   `-- src/
`-- frontend/
    |-- Dockerfile
    |-- nginx.conf
    |-- package.json
    `-- src/
```

---

## API Reference

| Method | Endpoint | Body |
|---|---|---|
| POST | `/api/new-game` | none |
| POST | `/api/move` | `{ "row": 0, "col": 0 }` |
| POST | `/api/ai-move` | `{ "time_limit": 5, "ai_type": "classic" }` |
| POST | `/api/ai-move-force` | `{ "time_limit": 5, "ai_type": "cnn" }` |
| POST | `/api/pass` | none |
| POST | `/api/undo` | none |
| GET | `/api/state` | none |
| GET | `/api/score` | none |
| GET | `/api/models` | none |
| POST | `/api/load-model` | `{ "path": "go_cnn_gpu.pth" }` |

---

## AI Overview

### Classic MCTS

The classic engine is a C++ Monte Carlo Tree Search implementation. It uses UCT/RAVE-style search, tactical move heuristics, rollout simulations, and backpropagation to choose moves.

### CNN + MCTS

The CNN engine uses a trained neural network to filter and evaluate promising moves, then MCTS searches those candidate moves. The shipped model is:

```text
backend/go_cnn_gpu.pth
```

The network was trained through self-play. The first iteration learned from MCTS-generated games, then later iterations trained from recent self-play data.

---

## Troubleshooting

### `start.bat` does not work on Mac

That is expected. `.bat` files are Windows scripts. Use Docker on macOS:

```bash
docker compose up --build
```

### Backend cannot import `go_engine`

You are probably trying to run the Windows `.pyd` on the wrong Python version or operating system. Use Docker, or rebuild the C++ engine for your platform.

### Frontend opens but API calls fail

Make sure the backend is running on:

```text
http://localhost:8000
```

If using Docker, make sure both containers are up:

```bash
docker compose ps
```
