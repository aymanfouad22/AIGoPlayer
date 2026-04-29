import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import numpy as np

from game import Game
from score import compute_score, compute_territory
from board import BLACK, WHITE
import cnn_agent
import go_engine

CNN_BATCH            = 50    # sims per CNN batch (GPU stays busy, loop checks deadline)
CLASSIC_BATCH        = 200   # sims per batch for time-limited classic search
CLASSIC_SIMS_MIN     = 200   # always do at least this many

# Pre-allocate C++ trees — reused across all requests
_classic_mcts = go_engine.ClassicMCTS(max_nodes=82000)
_cnn_pmcts    = go_engine.ParallelMCTS(1, 5000)   # cap ~300k nodes; enough for 10s @ ~50 sims/s

def _cnn_ai_move(game, time_limit=5.0):
    import go_engine
    board     = game.get_board()
    board_np  = np.array(board, dtype=np.int8)[None]
    player_np = np.array([game.current_player], dtype=np.int8)
    hashes_np = np.zeros(1, dtype=np.uint64)

    import torch
    import torch.nn.functional as F
    import train_gpu_local as T

    cnn    = cnn_agent.get_cnn()
    device = cnn_agent.device

    from ai import OPENING_BOOK

    board2d   = np.array(board)
    player    = int(game.current_player)
    stone_cnt = int((board2d != 0).sum())

    if stone_cnt in OPENING_BOOK:
        bm = OPENING_BOOK[stone_cnt]
        legal_flat = game.get_legal_moves()
        if list(bm) in [list(m) for m in legal_flat]:
            return bm, 0

    h_prior = cnn_agent._heuristic_prior(board2d, player)

    _cnn_pmcts.reset(board_np, player_np, hashes_np)

    deadline  = time.time() + time_limit
    total_sims = 0
    first_batch = True

    while True:
        for sim_idx in range(CNN_BATCH):
            raw_b, raw_p = _cnn_pmcts.get_leaves()
            bt = torch.from_numpy(raw_b).to(device)
            pt = torch.from_numpy(raw_p).to(device)
            with torch.no_grad(), torch.autocast('cuda', dtype=torch.float16,
                                                  enabled=(device.type == 'cuda')):
                pol_logits, val = cnn(T.to_planes_mixed(bt, pt))
                pol = F.softmax(pol_logits.float(), dim=1).cpu().numpy().astype(np.float32)
                val = val.squeeze(1).float().cpu().numpy().astype(np.float32)
            if first_batch and sim_idx == 0:
                blended = (1.0 - cnn_agent.BLEND) * pol[0] + cnn_agent.BLEND * h_prior
                pol[0]  = blended / (blended.sum() + 1e-8)
            _cnn_pmcts.apply_results(pol, val)
        total_sims += CNN_BATCH
        first_batch = False
        if time.time() >= deadline:
            break

    flat = int(_cnn_pmcts.get_best_moves()[0])
    return ((flat // 9, flat % 9) if flat >= 0 else None), total_sims

def _classic_ai_move(game, time_limit=5.0, force=False):
    """C++ ClassicMCTS with RAVE + smart rollout, runs until time_limit seconds elapse."""
    board_np  = np.array(game.get_board(), dtype=np.int8).flatten()
    stone_cnt = int((board_np != 0).sum())
    player    = int(game.current_player)

    _classic_mcts.reset(board_np, player, 0)

    deadline = time.time() + time_limit
    total_sims = 0
    # First batch always runs; subsequent batches only if time remains
    while True:
        _classic_mcts.run_sims(CLASSIC_BATCH, 50)
        total_sims += CLASSIC_BATCH
        if total_sims >= CLASSIC_SIMS_MIN and time.time() >= deadline:
            break

    flat  = _classic_mcts.best_move()
    vprob = _classic_mcts.visit_probs()  # shape (81,)
    best_prob = float(vprob[flat]) if flat >= 0 else 0.0

    # Pass conditions (skip in force mode)
    if flat < 0:
        return None, None
    if not force and stone_cnt >= 50 and best_prob < 0.10:
        return None, None

    # Build top-3 moves from visit probabilities
    top_idx = np.argsort(vprob)[::-1]
    top_moves = []
    for i in top_idx[:3]:
        if vprob[i] > 0:
            top_moves.append({
                'move':    [int(i // 9), int(i % 9)],
                'visits':  int(round(float(vprob[i]) * total_sims)),
                'winrate': round(float(vprob[i]), 3),
            })

    ai_stats = {
        'simulations':   total_sims,
        'best_move':     [flat // 9, flat % 9],
        'best_visits':   int(round(best_prob * total_sims)),
        'best_winrate':  round(best_prob, 3),
        'top_moves':     top_moves,
        'win_probability': round(best_prob, 3),
    }
    return (flat // 9, flat % 9), ai_stats


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

game = Game()
move_history: list = []
move_number: int = 0
ai_think_times: list = []


class MoveRequest(BaseModel):
    row: int
    col: int


class AIRequest(BaseModel):
    time_limit: Optional[float] = 5.0
    ai_type: Optional[str] = 'classic'  # 'classic' | 'cnn'


def get_territory(board):
    try:
        black_t, white_t = compute_territory(board)
        return {
            "black": [list(p) for p in black_t],
            "white": [list(p) for p in white_t],
        }
    except Exception:
        return {"black": [], "white": []}


def build_state(ai_stats=None, ai_passed=False):
    board = game.get_board()
    legal = game.get_legal_moves()
    try:
        score = game.get_score()
    except Exception:
        score = None
    territory = get_territory(board)

    return {
        "board": board.tolist() if hasattr(board, 'tolist') else board,
        "current_player": game.current_player,
        "captures": {str(k): v for k, v in game.captures.items()},
        "last_move": list(game.last_move) if game.last_move else None,
        "game_over": game.is_game_over(),
        "consecutive_passes": game.consecutive_passes,
        "move_number": move_number,
        "legal_moves": [list(m) for m in legal],
        "score": score,
        "ai_stats": ai_stats,
        "ai_passed": ai_passed,
        "move_history": move_history,
        "territory": territory,
    }


@app.post("/api/new-game")
def new_game():
    global game, move_history, move_number, ai_think_times
    game = Game()
    move_history = []
    move_number = 0
    ai_think_times = []
    return build_state()


@app.post("/api/move")
def play_move(req: MoveRequest):
    global move_number
    if game.is_game_over():
        raise HTTPException(status_code=400, detail="Game is over")
    player = game.current_player
    success = game.play_move(req.row, req.col)
    if not success:
        raise HTTPException(status_code=400, detail="Illegal move")
    move_number += 1
    move_history.append({"move_number": move_number, "player": player, "move": [req.row, req.col]})
    return build_state()


@app.post("/api/ai-move")
def ai_move_endpoint(req: AIRequest = None):
    global move_number
    if req is None:
        req = AIRequest()

    if game.is_game_over():
        raise HTTPException(status_code=400, detail="Game is over")

    player = game.current_player
    start  = time.time()

    # ── CNN+MCTS path ──────────────────────────────────────────────────────────
    if req.ai_type == 'cnn':
        move, cnn_sims = _cnn_ai_move(game, time_limit=req.time_limit)
        elapsed = time.time() - start
        if move is None or not game.play_move(*move):
            game.pass_turn()
            move_history.append({"move_number": move_number, "player": player, "move": "pass"})
            return build_state(ai_passed=True)
        move_number += 1
        move_history.append({"move_number": move_number, "player": player, "move": list(move)})
        ai_stats = {
            "simulations": cnn_sims,
            "time": round(elapsed, 2),
            "best_move": list(move),
            "best_visits": cnn_sims,
            "best_winrate": 0.0,
            "top_moves": [],
            "win_probability": 0.5,
            "opening_book": cnn_sims == 0,
        }
        return build_state(ai_stats=ai_stats)

    # ── Classic MCTS path — C++ RAVE + smart rollout ───────────────────────────
    start  = time.time()
    move, ai_stats = _classic_ai_move(game, time_limit=req.time_limit)
    elapsed = time.time() - start

    if move is None:
        game.pass_turn()
        move_history.append({"move_number": move_number, "player": player, "move": "pass"})
        return build_state(ai_passed=True)

    if game.play_move(*move):
        move_number += 1
        move_history.append({"move_number": move_number, "player": player, "move": list(move)})

    ai_think_times.append(elapsed)
    if ai_stats:
        ai_stats["time"] = round(elapsed, 2)
    return build_state(ai_stats=ai_stats)


@app.post("/api/pass")
def pass_turn():
    game.pass_turn()
    move_history.append({"move_number": move_number, "player": game.current_player, "move": "pass"})
    return build_state()


@app.post("/api/undo")
def undo_move():
    global move_number
    if not game.undo():
        raise HTTPException(status_code=400, detail="Nothing to undo")
    if move_history:
        move_history.pop()
    move_number = max(0, move_number - 1)
    return build_state()


@app.post("/api/ai-move-force")
def ai_move_force(req: AIRequest = None):
    """Force AI to play even if it would normally pass (override button)."""
    global move_number
    if req is None:
        req = AIRequest()
    if game.is_game_over():
        raise HTTPException(status_code=400, detail="Game is over")
    player = game.current_player
    if req.ai_type == 'cnn':
        move, _ = _cnn_ai_move(game, time_limit=req.time_limit)
    else:
        move, _ = _classic_ai_move(game, time_limit=req.time_limit, force=True)
    if move is None or not game.play_move(*move):
        return build_state(ai_passed=True)
    move_number += 1
    move_history.append({"move_number": move_number, "player": player, "move": list(move)})
    return build_state()


@app.get("/api/models")
def list_models():
    base = os.path.dirname(os.path.abspath(__file__))
    dirs = [base, os.path.join(base, 'training_data')]
    models = []
    for d in dirs:
        for f in sorted(os.listdir(d)):
            if f.endswith('.pth'):
                models.append({'name': f, 'path': os.path.join(d, f)})
    return {'models': models}


class LoadModelRequest(BaseModel):
    path: str


@app.post("/api/load-model")
def load_model(req: LoadModelRequest):
    base = os.path.abspath(os.path.dirname(__file__))
    abs_path = os.path.abspath(req.path)
    if not abs_path.startswith(base):
        raise HTTPException(status_code=400, detail="Invalid path")
    if not os.path.exists(abs_path):
        raise HTTPException(status_code=404, detail="Model not found")
    try:
        cnn_agent.reload_cnn(abs_path)
        return {'loaded': os.path.basename(abs_path)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/state")
def get_state():
    return build_state()


@app.get("/api/legal-moves")
def legal_moves_endpoint():
    return {"legal_moves": [list(m) for m in game.get_legal_moves()]}


@app.get("/api/score")
def get_score():
    try:
        return {"score": game.get_score()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
