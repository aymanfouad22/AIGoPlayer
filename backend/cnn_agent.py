"""CNN+MCTS agent with heuristic-blended priors."""
import sys
from pathlib import Path
import numpy as np
import torch
import torch.nn.functional as F

sys.path.insert(0, str(Path(__file__).parent))
import train_gpu_local as T
import go_engine
from ai import score_move, _get_urgent_moves, OPENING_BOOK
from rules import get_legal_moves

device  = T.device
N       = 9
EMPTY   = 0

# ── Heuristic blend weight ─────────────────────────────────────────────────────
# 0.0 = pure CNN, 1.0 = pure heuristic
BLEND   = 0.0   # heuristics now handled in C++ expand()
URGENT_BOOST = 3.0   # multiplier on urgent move prior (atari save/capture)

# ── Lazy model + MCTS loader ──────────────────────────────────────────────────
_cnn  = None
_pmcts = None
_pmcts_sims = None

def get_cnn(path='go_cnn_gpu.pth'):
    global _cnn
    if _cnn is None:
        _cnn = T.GoNet(**T.NET_CONFIG).to(device)
        _cnn.load_state_dict(torch.load(path, map_location=device, weights_only=True))
        _cnn.eval()
    return _cnn

def get_pmcts(n_sims):
    global _pmcts, _pmcts_sims
    if _pmcts is None or _pmcts_sims != n_sims:
        _pmcts      = go_engine.ParallelMCTS(1, n_sims)
        _pmcts_sims = n_sims
    return _pmcts

def reload_cnn(path):
    global _cnn
    _cnn = T.GoNet(**T.NET_CONFIG).to(device)
    _cnn.load_state_dict(torch.load(path, map_location=device, weights_only=True))
    _cnn.eval()

# ── Heuristic prior over 81 cells ─────────────────────────────────────────────
def _heuristic_prior(board2d, player):
    """Returns (81,) float32 prior from hand-coded heuristics."""
    legal = get_legal_moves(board2d, player, 0)
    if not legal:
        return np.ones(81, dtype=np.float32) / 81

    legal_set  = set(legal)
    urgent     = set(_get_urgent_moves(board2d, legal_set))
    raw        = np.zeros(81, dtype=np.float32)

    for move in legal:
        s = float(score_move(board2d, move, player))
        idx = move[0] * N + move[1]
        raw[idx] = max(0.0, s)
        if move in urgent:
            raw[idx] *= URGENT_BOOST

    total = raw.sum()
    if total < 1e-8:
        uniform = np.zeros(81, dtype=np.float32)
        for m in legal:
            uniform[m[0] * N + m[1]] = 1.0
        return uniform / len(legal)
    return raw / total

# ── Main move function ─────────────────────────────────────────────────────────
def cnn_move(go_game, n_sims=400, opponent_passed=False, cnn_path='go_cnn_gpu.pth'):
    """
    Returns (row, col) or None (pass).
    go_game must be a go_engine.Game instance.
    """
    cnn = get_cnn(cnn_path)

    board2d    = np.array(go_game.get_board())   # (9,9) for heuristics
    player     = int(go_game.current_player)
    stone_cnt  = int((board2d != EMPTY).sum())

    # ── Opening book ──────────────────────────────────────────────────────────
    if stone_cnt in OPENING_BOOK:
        bm = OPENING_BOOK[stone_cnt]
        legal_flat = go_game.get_legal_moves()
        if bm[0] * N + bm[1] in legal_flat:
            return bm

    # ── Precompute heuristic prior for root blending ──────────────────────────
    h_prior = _heuristic_prior(board2d, player) if BLEND > 0 else None

    board_np  = board2d[None].astype(np.int8)     # (1,9,9)
    player_np = np.array([player], dtype=np.int8)
    hashes_np = np.zeros(1, dtype=np.uint64)

    pmcts = get_pmcts(n_sims)
    pmcts.reset(board_np, player_np, hashes_np)

    import time
    t0 = time.time()
    for sim_idx in range(n_sims):
        raw_b, raw_p = pmcts.get_leaves()
        bt = torch.from_numpy(raw_b).to(device)
        pt = torch.from_numpy(raw_p).to(device)

        with torch.no_grad(), torch.autocast('cuda', dtype=torch.float16,
                                              enabled=(device.type == 'cuda')):
            pol_logits, val = cnn(T.to_planes_mixed(bt, pt))
            pol = F.softmax(pol_logits.float(), dim=1).cpu().numpy().astype(np.float32)
            val = val.squeeze(1).float().cpu().numpy().astype(np.float32)

            # Blend heuristics only at the root (sim 0, leaf is root node)
        if sim_idx == 0 and BLEND > 0:
            blended = (1.0 - BLEND) * pol[0] + BLEND * h_prior
            pol[0]  = blended / (blended.sum() + 1e-8)

        pmcts.apply_results(pol, val)

    # ── Pick move ─────────────────────────────────────────────────────────────
    print(f'        [CNN: {n_sims} sims in {time.time()-t0:.2f}s]', flush=True)
    flat = int(pmcts.get_best_moves()[0])
    if flat < 0:
        return None

    # Pass if low confidence late game
    visit_probs = pmcts.get_visit_probs()
    best_prob   = float(visit_probs[0, flat])

    if stone_cnt >= 60 and best_prob < 0.05:
        return None
    if opponent_passed and stone_cnt >= 60 and best_prob < 0.20:
        return None

    return (flat // N, flat % N)
