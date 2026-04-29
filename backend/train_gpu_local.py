"""
GPU MCTS training pipeline — local version (RTX 5090 / any CUDA GPU).
Run from go_player/ directory:  python train_gpu_local.py
"""

import sys, os, time, math, pickle, random
from pathlib import Path
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import Dataset, DataLoader

# ── Paths ─────────────────────────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
DATA_DIR = BASE_DIR / 'training_data'
DATA_DIR.mkdir(exist_ok=True)
sys.path.insert(0, str(BASE_DIR))

import go_engine
Game = go_engine.Game

device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
print(f'Device : {device}')
if device.type == 'cuda':
    print(f'GPU    : {torch.cuda.get_device_name(0)}')
    print(f'VRAM   : {torch.cuda.get_device_properties(0).total_memory/1e9:.1f} GB')

MODEL_PATH    = BASE_DIR / 'go_cnn_gpu.pth'
N             = 9
BLACK, WHITE, EMPTY = 1, 2, 0
BATCH_SIZE    = 512
REPLAY_WINDOW = 4

# ── GPU Board Ops ─────────────────────────────────────────────────────────────

def _nb(x):
    return (F.pad(x[..., 1:,  :], (0,0,0,1)) + F.pad(x[..., :-1, :], (0,0,1,0)) +
            F.pad(x[..., :, 1:],  (0,1,0,0)) + F.pad(x[..., :, :-1], (1,0,0,0)))

def _has_liberty(boards, color):
    stone = (boards == color)
    alive = ((_nb((boards == EMPTY).float()) > 0) & stone).float()
    for _ in range(2 * N):
        new = (alive.bool() | ((_nb(alive) > 0) & stone)).float() * stone.float()
        if torch.equal(new, alive): break
        alive = new
    return alive.bool()

def _remove_dead(boards, color):
    dead = (boards == color) & ~_has_liberty(boards, color)
    out  = boards.clone(); out[dead] = EMPTY; return out

def apply_move_mixed(boards, rows, cols, players):
    B, dev = boards.shape[0], boards.device
    idx = torch.arange(B, device=dev)
    out = boards.clone(); out[idx, rows, cols] = players
    caps  = torch.zeros(B, dtype=torch.int32, device=dev)
    valid = torch.zeros(B, dtype=torch.bool,  device=dev)
    for color in (BLACK, WHITE):
        m = (players == color)
        if not m.any(): continue
        opp = 3 - color
        ob  = (out[m] == opp).view(m.sum(), -1).sum(1)
        out[m] = _remove_dead(out[m], opp)
        caps[m] = (ob - (out[m] == opp).view(m.sum(), -1).sum(1)).int()
        alive = _has_liberty(out[m], color)
        valid[m] = alive[torch.arange(m.sum(), device=dev), rows[m], cols[m]]
    return out, caps, valid

def legal_mask(boards, player):
    opp = 3 - player
    ef = (boards == EMPTY).float()
    of = (boards == player).float()
    xf = (boards == opp).float()
    ol = _nb(ef) * of; xl = _nb(ef) * xf
    ok = ((_nb(ef) > 0) | (_nb((ol > 1).float()) > 0) | (_nb((xl == 1).float()) > 0))
    return (ok & (boards == EMPTY)).view(boards.shape[0], N * N)

def legal_mask_mixed(boards, players):
    out = torch.zeros(boards.shape[0], N * N, dtype=torch.bool, device=boards.device)
    for color in (BLACK, WHITE):
        m = (players == color)
        if m.any(): out[m] = legal_mask(boards[m], color)
    return out

def to_planes(boards, player):
    B, dev = boards.shape[0], boards.device
    opp = 3 - player
    of = (boards == player).float(); xf = (boards == opp).float()
    ef = (boards == EMPTY).float();  nb = _nb(ef)
    p  = torch.zeros(B, 10, N, N, dtype=torch.float32, device=dev)
    p[:,0]=of; p[:,1]=xf; p[:,2]=1.0
    p[:,3]=(boards!=EMPTY).float().view(B,-1).sum(1).view(B,1,1).expand(B,N,N)/(N*N)
    p[:,4]=of*(nb==1).float(); p[:,5]=of*(nb==2).float(); p[:,6]=of*(nb>=3).float()
    p[:,7]=xf*(nb==1).float(); p[:,8]=xf*(nb==2).float(); p[:,9]=xf*(nb>=3).float()
    return p

def to_planes_mixed(boards, players):
    out = torch.zeros(boards.shape[0], 10, N, N, dtype=torch.float32, device=boards.device)
    for color in (BLACK, WHITE):
        m = (players == color)
        if m.any(): out[m] = to_planes(boards[m], color)
    return out

print('GPU board ops ready.')

# ── GPU MCTS Forest ───────────────────────────────────────────────────────────

class Forest:
    def __init__(self, G, M, dev):
        self.G=G; self.M=M; self.dev=dev
        kw = dict(device=dev)
        self.boards   = torch.zeros(G, M, N, N, dtype=torch.int8,    **kw)
        self.players  = torch.zeros(G, M,       dtype=torch.int8,    **kw)
        self.parent   = torch.full((G, M),    -1, dtype=torch.int32, **kw)
        self.move_r   = torch.full((G, M),    -1, dtype=torch.int8,  **kw)
        self.move_c   = torch.full((G, M),    -1, dtype=torch.int8,  **kw)
        self.children = torch.full((G, M, N*N),-1, dtype=torch.int32,**kw)
        self.n_ch     = torch.zeros(G, M,       dtype=torch.int32,   **kw)
        self.expanded = torch.zeros(G, M,       dtype=torch.bool,    **kw)
        self.visits   = torch.zeros(G, M,       dtype=torch.float32, **kw)
        self.wins     = torch.zeros(G, M,       dtype=torch.float32, **kw)
        self.priors   = torch.zeros(G, M,       dtype=torch.float32, **kw)
        self.nc       = torch.ones(G,           dtype=torch.int32,   **kw)
    def alloc(self, counts):
        s = self.nc.clone(); self.nc.add_(counts); return s

@torch.no_grad()
def _infer(cnn, boards, players):
    x = to_planes_mixed(boards, players)
    pol, val = cnn(x)
    return F.softmax(pol, dim=1), val.squeeze(1)

def _select(f):
    G, dev = f.G, f.dev
    g   = torch.arange(G, device=dev)
    cur = torch.zeros(G, dtype=torch.int32, device=dev)
    for _ in range(200):
        exp = f.expanded[g, cur]; nch = f.n_ch[g, cur]
        go  = exp & (nch > 0)
        if not go.any().item(): break
        ch  = f.children[g, cur]; ok = ch >= 0; safe = ch.clamp(min=0).long()
        gx  = g.unsqueeze(1).expand(G, N*N)
        cv  = f.visits[gx, safe]; cw = f.wins[gx, safe]; cp = f.priors[gx, safe]
        pv  = f.visits[g, cur].unsqueeze(1)
        cq  = torch.where(cv > 0, cw / cv.clamp(1e-8), torch.zeros_like(cv))
        sc  = cq + 2.0 * cp * pv.sqrt() / (1.0 + cv)
        sc  = sc.masked_fill(~ok, float('-inf'))
        bn  = ch[g, sc.argmax(dim=1)]
        cur = torch.where(go, bn, cur)
    return cur

def _expand(f, leaf, cnn, noise=False, da=0.3, de=0.25):
    G = f.G; dev = f.dev; g = torch.arange(G, device=dev)
    lb = f.boards[g, leaf]; lp = f.players[g, leaf]
    probs, vals = _infer(cnn, lb, lp)
    lgl = legal_mask_mixed(lb, lp)
    if noise:
        for gi in range(G):
            if leaf[gi] == 0:
                nm = int(lgl[gi].sum().item())
                if nm > 0:
                    ns = torch.tensor(np.random.dirichlet([da]*nm), dtype=torch.float32, device=dev)
                    tmp = probs[gi].clone(); tmp[lgl[gi]] = (1-de)*tmp[lgl[gi]] + de*ns
                    probs[gi] = tmp
    masked = probs * lgl.float(); s = masked.sum(1, keepdim=True).clamp(1e-8)
    prior  = masked / s
    pg, pm = lgl.nonzero(as_tuple=True)
    if pg.numel() == 0:
        f.expanded[g, leaf] = True; return vals
    pb = lb[pg]; pp = lp[pg]
    pr = (pm // N).long(); pc = (pm % N).long()
    cb, _, valid = apply_move_mixed(pb, pr, pc, pp)
    vg = pg[valid]; vm = pm[valid]; vcb = cb[valid]
    vcp = (3 - pp[valid]).to(torch.int8)
    vr  = (vm // N).to(torch.int8); vc = (vm % N).to(torch.int8)
    cnts = torch.zeros(G, dtype=torch.int32, device=dev)
    cnts.scatter_add_(0, vg.int(), torch.ones(vg.shape[0], dtype=torch.int32, device=dev))
    starts = f.alloc(cnts)
    off = torch.zeros(vg.shape[0], dtype=torch.int32, device=dev)
    for gi in range(G):
        m = (vg == gi)
        if m.any(): off[m] = torch.arange(int(m.sum()), dtype=torch.int32, device=dev)
    nids = (starts[vg] + off).clamp(max=f.M - 1)
    f.boards[vg, nids]  = vcb; f.players[vg, nids] = vcp
    f.parent[vg, nids]  = leaf[vg].int()
    f.move_r[vg, nids]  = vr;  f.move_c[vg, nids]  = vc
    f.priors[vg, nids]  = prior[vg, vm]
    f.children[vg, leaf[vg], off] = nids.int()
    f.n_ch[g, leaf] = cnts; f.expanded[g, leaf] = True
    return vals

def _backprop(f, leaf, values):
    G, dev = f.G, f.dev
    g = torch.arange(G, device=dev)
    cur = leaf.clone().long(); v = values.clone()
    for _ in range(200):   # max tree depth — no GPU→CPU sync needed
        par = f.parent[g, cur]                      # int32, -1 at root
        active = (par >= 0)                         # True until we hit root
        f.visits[g, cur] += active.float()
        f.wins[g, cur]   += ((v + 1) / 2) * active.float()
        cur = torch.where(active, par.long(), cur)
        v   = -v
        if not active.any():                        # all reached root
            break

@torch.no_grad()
def mcts(boards, players, cnn, n_sims=800, noise=False, da=0.3, de=0.25):
    G = boards.shape[0]
    f = Forest(G, n_sims * 40 + 500, device)
    for gi in range(G):
        f.boards[gi, 0]  = boards[gi]
        f.players[gi, 0] = int(players[gi].item())
    root = torch.zeros(G, dtype=torch.int32, device=device)
    _expand(f, root, cnn, noise=noise, da=da, de=de)
    for _ in range(n_sims):
        lv = _select(f); vl = _expand(f, lv, cnn); _backprop(f, lv, vl)
    g   = torch.arange(G, device=device)
    rch = f.children[g, torch.zeros(G, dtype=torch.long, device=device)]
    ok  = rch >= 0
    best  = torch.full((G, 2), -1, dtype=torch.int32, device=device)
    vprob = torch.zeros(G, N*N, dtype=torch.float32, device=device)
    for gi in range(G):
        slots = ok[gi].nonzero(as_tuple=False).squeeze(1)
        if slots.numel() == 0: continue
        cn = rch[gi, slots]; cv = f.visits[gi, cn.long()]
        bi = int(cv.argmax().item()); bn = int(cn[bi].item())
        best[gi, 0] = f.move_r[gi, bn].int()
        best[gi, 1] = f.move_c[gi, bn].int()
        tot = cv.sum().clamp(1.0)
        for _, n_ in zip(slots.tolist(), cn.tolist()):
            r_ = int(f.move_r[gi, n_].item()); c_ = int(f.move_c[gi, n_].item())
            vprob[gi, r_*N+c_] = f.visits[gi, n_] / tot
    return best, vprob

def sel_temp(vprob, mnums, thresh=12):
    res = []
    for gi in range(vprob.shape[0]):
        vp = vprob[gi].cpu().numpy()
        if vp.sum() == 0: res.append(None); continue
        vp /= vp.sum()
        idx = np.random.choice(N*N, p=vp) if mnums[gi] <= thresh else int(np.argmax(vp))
        res.append((idx // N, idx % N))
    return res

if torch.cuda.is_available():
    try:
        _select   = torch.compile(_select,   mode='reduce-overhead')
        _expand   = torch.compile(_expand,   mode='reduce-overhead')
        _backprop = torch.compile(_backprop, mode='reduce-overhead')
        print('GPU MCTS ready. (torch.compile enabled)')
    except Exception:
        print('GPU MCTS ready. (torch.compile unavailable)')
else:
    print('GPU MCTS ready.')

# ── Self-Play ─────────────────────────────────────────────────────────────────

def augment(planes, vp, val):
    pol = vp.reshape(N, N); out = []
    for k in range(4):
        for flip in (False, True):
            p = np.rot90(planes, k, axes=(1,2)); pb = np.rot90(pol, k)
            if flip: p = np.flip(p, axis=2); pb = np.flip(pb, axis=1)
            out.append((p.copy(), pb.ravel().copy(), float(val)))
    return out

def selfplay(cnn, n_games=128, n_sims=200, max_moves=100,
             temp=12, da=0.3, de=0.25, wave=32):
    """Self-play: C++ MCTS trees handle select/expand/backprop; GPU handles CNN only."""
    cnn.eval(); all_data = []; done = 0; t0 = time.time()
    print(f'  Allocating C++ MCTS ({wave} games × {n_sims} sims)...', flush=True)
    # Pre-allocate MCTS once for the full wave size; reset() is O(1)
    pmcts = go_engine.ParallelMCTS(wave, n_sims)
    print(f'  MCTS allocated. Starting self-play...', flush=True)

    while done < n_games:
        W = min(wave, n_games - done)
        if W != pmcts.G:                          # last partial wave
            pmcts = go_engine.ParallelMCTS(W, n_sims)

        games    = [Game() for _ in range(W)]
        traj     = [[] for _ in range(W)]
        mn       = [0] * W
        finished = [False] * W
        step     = 0; t_wave = time.time()

        while not all(finished):
            # ── Gather board states (finished games → zeroed dummy) ──────────
            boards_np  = np.zeros((W, N, N), dtype=np.int8)
            players_np = np.ones(W, dtype=np.int8)    # default BLACK
            hashes_np  = np.zeros(W, dtype=np.uint64)
            for gi in range(W):
                if not finished[gi]:
                    boards_np[gi]  = games[gi].get_board()
                    players_np[gi] = games[gi].current_player

            # ── Reset C++ MCTS trees ─────────────────────────────────────────
            pmcts.reset(boards_np, players_np, hashes_np)

            # ── Sim 0: expand roots with Dirichlet noise ─────────────────────
            raw_b, raw_p = pmcts.get_leaves()
            bt = torch.from_numpy(raw_b).to(device)
            pt = torch.from_numpy(raw_p).to(device)
            with torch.no_grad(), torch.autocast('cuda', dtype=torch.float16):
                pol_logits, val = cnn(to_planes_mixed(bt, pt))
                pol = F.softmax(pol_logits.float(), dim=1).cpu().numpy()
                val = val.float()
            for gi in range(W):
                if not finished[gi]:
                    noise = np.random.dirichlet([da] * (N * N))
                    pol[gi] = (1 - de) * pol[gi] + de * noise
            pmcts.apply_results(
                pol.astype(np.float32),
                val.squeeze(1).cpu().numpy().astype(np.float32),
            )

            # ── Sims 1…n_sims-1: pure MCTS (C++ select, GPU CNN, C++ expand) ─
            for _ in range(n_sims - 1):
                raw_b, raw_p = pmcts.get_leaves()
                bt = torch.from_numpy(raw_b).to(device)
                pt = torch.from_numpy(raw_p).to(device)
                with torch.no_grad(), torch.autocast('cuda', dtype=torch.float16):
                    pol_logits, val = cnn(to_planes_mixed(bt, pt))
                    pol = F.softmax(pol_logits.float(), dim=1)
                    val = val.float()
                pmcts.apply_results(
                    pol.cpu().numpy().astype(np.float32),
                    val.squeeze(1).cpu().numpy().astype(np.float32),
                )

            # ── Collect results ───────────────────────────────────────────────
            best_flat = pmcts.get_best_moves()     # (W,) flat index or -1
            vprobs    = pmcts.get_visit_probs()    # (W, 81)

            # Training planes for current positions (before playing the move)
            bt_cur = torch.from_numpy(boards_np).to(device)
            pt_cur = torch.from_numpy(players_np).to(device)
            pl_b   = to_planes_mixed(bt_cur, pt_cur).cpu().numpy()

            for gi in range(W):
                if finished[gi]: continue
                g    = games[gi]
                flat = int(best_flat[gi])
                vpi  = vprobs[gi].copy()
                pl   = int(players_np[gi])

                # Temperature-based move selection
                move_n = mn[gi]
                if flat < 0:
                    g.pass_turn()
                else:
                    if move_n <= temp:
                        # Sample proportional to visit counts
                        if vpi.sum() > 0:
                            vpi_norm = vpi / vpi.sum()
                            flat = int(np.random.choice(N * N, p=vpi_norm))
                    traj[gi].append((pl_b[gi], vprobs[gi].copy(), pl))
                    g.play_move(flat // N, flat % N)
                    mn[gi] += 1

                if g.is_game_over() or mn[gi] >= max_moves:
                    finished[gi] = True

            step += 1
            n_active = W - sum(finished)
            if step % 5 == 0:
                sps = step / max(time.time() - t_wave, 1e-3)
                print(f'  wave {done//wave+1} | step {step:3d} | active {n_active:2d}/{W} '
                      f'| {sps:.2f} steps/s', flush=True)

        for gi in range(W):
            if not traj[gi]: continue
            sc  = games[gi].get_score()
            win = BLACK if sc['black_score'] > sc['white_score'] else WHITE
            for planes, vpi, p in traj[gi]:
                v = 1.0 if p == win else -1.0
                all_data.extend(augment(planes, vpi, v))

        done += W
        el = time.time() - t0; rate = done / el if el > 0 else 1
        print(f'  >> {done}/{n_games} games | {len(all_data):,} pos | '
              f'ETA {(n_games-done)/rate/60:.1f}min', flush=True)

    print(f'  Done: {len(all_data):,} pos in {(time.time()-t0)/60:.1f}min', flush=True)
    return all_data

def load_replay(it, window=4):
    buf = []
    if it <= 3:   # bootstrap only helps before model outgrows random-play data
        for p in sorted(DATA_DIR.glob('selfplay_*g.pkl')):
            with open(p, 'rb') as f: d = pickle.load(f)
            buf.extend(d); print(f'  bootstrap {p.name}: {len(d):,}', flush=True); break
    for i in range(max(1, it - window + 1), it + 1):
        p = DATA_DIR / f'selfplay_iter{i}.pkl'
        if p.exists():
            with open(p, 'rb') as f: d = pickle.load(f)
            buf.extend(d); print(f'  iter {i}: {len(d):,} ({len(buf):,} total)', flush=True)
    return buf

print('Self-play ready.')

# ── CNN Model ─────────────────────────────────────────────────────────────────

class ResBlock(nn.Module):
    def __init__(self, f):
        super().__init__()
        self.net = nn.Sequential(
            nn.Conv2d(f,f,3,padding=1,bias=False), nn.BatchNorm2d(f), nn.ReLU(True),
            nn.Conv2d(f,f,3,padding=1,bias=False), nn.BatchNorm2d(f))
    def forward(self, x): return F.relu(x + self.net(x), True)

class GoNet(nn.Module):
    def __init__(self, in_channels=10, filters=192, n_blocks=10):
        super().__init__()
        self.stem  = nn.Sequential(nn.Conv2d(in_channels,filters,3,padding=1,bias=False),
                                   nn.BatchNorm2d(filters), nn.ReLU(True))
        self.tower = nn.Sequential(*[ResBlock(filters) for _ in range(n_blocks)])
        self.policy_head = nn.Sequential(
            nn.Conv2d(filters,2,1,bias=False), nn.BatchNorm2d(2), nn.ReLU(True),
            nn.Flatten(), nn.Linear(2*81, 81))
        self.value_head  = nn.Sequential(
            nn.Conv2d(filters,1,1,bias=False), nn.BatchNorm2d(1), nn.ReLU(True),
            nn.Flatten(), nn.Linear(81,64), nn.ReLU(True), nn.Linear(64,1), nn.Tanh())
    def forward(self, x): x = self.tower(self.stem(x)); return self.policy_head(x), self.value_head(x)

class GoDataset(Dataset):
    def __init__(self, data):
        self.p = torch.FloatTensor(np.stack([d[0] for d in data]))
        self.q = torch.FloatTensor(np.stack([d[1] for d in data]))
        self.v = torch.FloatTensor(np.array([d[2] for d in data]))
    def __len__(self): return len(self.p)
    def __getitem__(self, i): return self.p[i], self.q[i], self.v[i]

def run_epoch(m, loader, train=True, opt=None):
    m.train() if train else m.eval()
    ps = vs = ac = n = 0
    with (torch.enable_grad() if train else torch.no_grad()):
        for pl, po, va in loader:
            pl=pl.to(device); po=po.to(device); va=va.to(device).unsqueeze(1)
            p, v = m(pl)
            pl_ = F.kl_div(F.log_softmax(p,1), po, reduction='batchmean')
            vl_ = F.mse_loss(v, va)
            if train: opt.zero_grad(); (pl_+vl_).backward(); opt.step()
            ps += pl_.item(); vs += vl_.item()
            ac += (p.argmax(1) == po.argmax(1)).float().mean().item(); n += 1
    return ps/n, vs/n, ac/n

NET_CONFIG = dict(in_channels=10, filters=192, n_blocks=10)
cnn = GoNet(**NET_CONFIG).to(device)
if MODEL_PATH.exists():
    cnn.load_state_dict(torch.load(MODEL_PATH, map_location=device, weights_only=True))
    print(f'Loaded: {MODEL_PATH}')
else:
    print('Starting fresh model')
print(f'Params: {sum(p.numel() for p in cnn.parameters()):,}')

# ── Training Loop ─────────────────────────────────────────────────────────────
# Sim curriculum for 9x9 Go (C++ MCTS + fp16 CNN):
#   Iter  1-3 : 100 sims — model is random, sims don't matter, generate lots of games fast
#   Iter  4-10: 200 sims — value head has signal, cleaner policy targets
#   Iter 11+  : 400 sims — model is strong, deeper search improves pi quality

def sims_for_iter(it):
    if it <= 3:  return 100
    if it <= 10: return 200
    if it <= 19: return 400
    return 800

def run_iteration(it, n_games=128, n_sims=None, epochs=30, patience=8, wave=128):
    if n_sims is None: n_sims = sims_for_iter(it)
    print(f'\n====== Iter {it} — {n_games}g x {n_sims}s ======', flush=True)
    t0   = time.time()
    data = selfplay(cnn, n_games=n_games, n_sims=n_sims, wave=wave)
    out  = DATA_DIR / f'selfplay_iter{it}.pkl'
    with open(out, 'wb') as f: pickle.dump(data, f)
    print(f'  Saved {len(data):,} pos in {(time.time()-t0)/60:.1f}min', flush=True)

    replay = load_replay(it, REPLAY_WINDOW)
    print(f'  Replay: {len(replay):,} positions', flush=True)

    print(f'  Building dataset...', flush=True)
    ds  = GoDataset(replay); ntr = int(0.9 * len(ds))
    print(f'  Dataset ready: {len(ds):,} positions', flush=True)
    tr, vl = torch.utils.data.random_split(ds, [ntr, len(ds)-ntr])
    trl = DataLoader(tr, batch_size=BATCH_SIZE, shuffle=True,  num_workers=0, pin_memory=True)
    vll = DataLoader(vl, batch_size=BATCH_SIZE, shuffle=False, num_workers=0, pin_memory=True)
    opt = torch.optim.AdamW(cnn.parameters(), lr=5e-4, weight_decay=1e-4)
    sch = torch.optim.lr_scheduler.CosineAnnealingLR(opt, patience * 2)
    best = 0.0; ni = 0
    for ep in range(1, epochs+1):
        run_epoch(cnn, trl, True, opt)
        _, _, acc = run_epoch(cnn, vll, False)
        sch.step()
        if acc > best:
            best=acc; ni=0
            torch.save(cnn.state_dict(), MODEL_PATH)
        else: ni += 1
        if ep % 5 == 0: print(f'  Ep{ep}: {acc:.2%} best={best:.2%}', flush=True)
        if ni >= patience: print(f'  Early stop ep{ep}', flush=True); break
    # Save a frozen snapshot for later evaluation
    torch.save(cnn.state_dict(), DATA_DIR / f'model_iter{it}.pth')
    cnn.load_state_dict(torch.load(MODEL_PATH, map_location=device, weights_only=True))
    cnn.eval(); print(f'  Iter {it} done — {best:.2%}', flush=True)
    return best

if __name__ == '__main__':
    START_ITER   = 20
    N_ITERATIONS = 30
    acc_history  = []

    for it in range(START_ITER, N_ITERATIONS + 1):
        acc = run_iteration(it)
        acc_history.append(acc)
        print(f'  History: {[f"{a:.2%}" for a in acc_history]}', flush=True)
        with open(DATA_DIR / 'acc_history.pkl', 'wb') as f: pickle.dump(acc_history, f)
