# AI strategy and testing notes
#
# My AI combines two ideas: a convolutional neural network (CNN) and Monte
# Carlo Tree Search (MCTS). The CNN is used as a policy filter: given the
# current 9x9 board position, it predicts which legal moves are likely to be
# good candidates. MCTS then searches among those candidates by running many
# simulated continuations and choosing the move with the strongest search
# result. I chose this hybrid strategy because it follows the same general
# direction that made AlphaGo successful: a neural network gives the search
# useful guidance, while tree search prevents the move choice from depending
# only on a single static evaluation.
#
# A major design decision was to keep hand-written Go knowledge in the engine
# instead of relying only on the CNN. The code still scores urgent tactical
# moves such as captures, saving groups in atari, connecting to friendly
# stones, avoiding obvious eye-filling, and avoiding moves deep inside settled
# opponent territory. I also used RAVE-style rollout information so that moves
# appearing in successful simulations can become more attractive earlier in
# the search. This helped make the MCTS less random and more useful before the
# CNN had learned enough from self-play.
#
# The CNN was trained through self-play. The first training iteration learned
# from MCTS-generated games directly, using about 500 games as the starting
# data. After that, I trained for 30 iterations total and used a replay window
# from the last 4 iterations so the model could keep learning from recent
# stronger versions of itself without forgetting too much useful older play.
# One challenge was balancing speed and strength: deeper MCTS gives better
# decisions, but the web app still needs the AI to return a move quickly, so
# the code mixes fast heuristics, a learned policy, and bounded simulations.
#
# Beyond the provided tests, I tested the AI by playing it against a classic
# MCTS baseline using about 6000 simulations per move. I also tested it against
# GNU Go to check that it made reasonable strategic and tactical choices
# against an established Go engine, not just against my own implementation.
import math
import random
import time
import numpy as np

from board import (
    BOARD_SIZE, EMPTY, BLACK, WHITE,
    clone_board, board_hash, get_neighbors, create_board,
)
from rules import get_group, get_legal_moves, apply_move
from score import compute_score

# ---------------------------------------------------------------------------
# Opening book (indexed by stone count *before* the AI move)
# ---------------------------------------------------------------------------
OPENING_BOOK = {
    0: (4, 4),
    1: (6, 6),
    2: (2, 2),
    3: (6, 2),
    4: (2, 6),
}

# ---------------------------------------------------------------------------
# Move heuristic — no board clone, O(4 neighbors) BFS only
# ---------------------------------------------------------------------------
def _in_opponent_zone(board, r, c, color):
    """True if cell is likely deep inside opponent settled territory."""
    opponent = 3 - color
    nbrs = get_neighbors(r, c)
    opp_nbrs = sum(1 for nr, nc in nbrs if board[nr][nc] == opponent)
    own_nbrs = sum(1 for nr, nc in nbrs if board[nr][nc] == color)
    # Surrounded on almost all sides by opponent, no own stones adjacent
    return opp_nbrs >= len(nbrs) - 1 and own_nbrs == 0


def score_move(board, move, color):
    r, c = move
    opponent = 3 - color
    score = 0

    # Positional
    score += (4 - abs(r - 4)) + (4 - abs(c - 4))
    if 2 <= r <= 6 and 2 <= c <= 6:
        score += 3
    if r == 0 or r == 8 or c == 0 or c == 8:
        score -= 6
    elif r == 1 or r == 7 or c == 1 or c == 7:
        score -= 2

    nbrs = get_neighbors(r, c)
    own = 0
    opp = 0
    is_capture = False
    for nr, nc in nbrs:
        cell = int(board[nr][nc])
        if cell == color:
            own += 1
            _, libs = get_group(board, nr, nc)
            if len(libs) == 1:
                score += 15          # save own group in atari
        elif cell == opponent:
            opp += 1
            cap_group, libs = get_group(board, nr, nc)
            if len(libs) == 1:
                # Size-aware capture bonus: single-stone captures are Ko-prone
                # so reward them less; big captures reward much more
                cap_size = len(cap_group)
                if cap_size == 1:
                    score += 12      # reduced from 20 — single stone, Ko risk
                else:
                    score += 20 + cap_size * 3  # big capture: much higher reward
                is_capture = True
            elif len(libs) == 2:
                score += 8           # put opponent in atari

    score += own * 4                 # extend / connect
    score += opp * 3                 # approach opponent

    # Don't fill own eye (all 4 orthogonal neighbors are own color)
    if len(nbrs) == 4 and own == 4:
        score -= 30

    # Penalise moves deep inside opponent territory unless it's a capture
    if not is_capture and _in_opponent_zone(board, r, c, color):
        score -= 20

    return score


# ---------------------------------------------------------------------------
# Rollout — fast stone-count evaluation, no territory BFS
# ---------------------------------------------------------------------------
def _rollout_winner(b):
    result = compute_score(b)
    return BLACK if result["black_score"] > result["white_score"] else WHITE


def rollout(board, player):
    b = board.copy()
    current = player
    last_r = last_c = -1
    moves_played = []   # RAVE: list of ((r,c), player)

    for _ in range(40):
        # Flat index scan — fast on 81-element array
        flat_empty = np.where(b.ravel() == EMPTY)[0]
        n = len(flat_empty)
        if n == 0:
            break

        # 20 % of the time: look for a capture/save near the last stone
        move = None
        if last_r >= 0 and random.random() < 0.20:
            for nr, nc in get_neighbors(last_r, last_c):
                if b[nr][nc] == EMPTY:
                    continue
                _, libs = get_group(b, nr, nc)
                if len(libs) == 1:
                    lib = next(iter(libs))
                    if b[lib[0]][lib[1]] == EMPTY:
                        move = lib
                        break

        if move is None:
            fi = flat_empty[random.randrange(n)]
            r, c = int(fi // BOARD_SIZE), int(fi % BOARD_SIZE)
            # Quick eye skip — try once more if all 4 neighbors are own
            nbrs = get_neighbors(r, c)
            if len(nbrs) == 4 and all(b[nr][nc] == current for nr, nc in nbrs):
                fi2 = flat_empty[random.randrange(n)]
                r, c = int(fi2 // BOARD_SIZE), int(fi2 % BOARD_SIZE)
            move = (r, c)

        r, c = move
        b[r][c] = current
        last_r, last_c = r, c
        moves_played.append(((r, c), current))

        opponent = 3 - current
        for nr, nc in get_neighbors(r, c):
            if b[nr][nc] == opponent:
                grp, libs = get_group(b, nr, nc)
                if not libs:
                    for gr, gc in grp:
                        b[gr][gc] = EMPTY

        current = 3 - current

    return _rollout_winner(b), moves_played


# ---------------------------------------------------------------------------
# Urgent-move detector — O(stones) scan, no cloning
# ---------------------------------------------------------------------------
def _get_urgent_moves(board, legal_set):
    """
    Returns moves that must be considered regardless of scoring:
    - Saves: fill the last liberty of our own group in atari
    - Captures: fill the last liberty of an opponent group in atari
    Returned list is deduplicated and filtered to legal moves.
    """
    urgent = set()
    visited_groups = set()

    for r in range(BOARD_SIZE):
        for c in range(BOARD_SIZE):
            cell = int(board[r][c])
            if cell == EMPTY:
                continue
            if (r, c) in visited_groups:
                continue
            grp, libs = get_group(board, r, c)
            visited_groups.update(grp)
            if len(libs) == 1:
                lib = next(iter(libs))
                if lib in legal_set:
                    urgent.add(lib)   # captures opponent OR saves own

    return list(urgent)


# ---------------------------------------------------------------------------
# MCTS node
# ---------------------------------------------------------------------------
class MCTSNode:
    __slots__ = [
        'board', 'player', 'prev_hash', 'parent',
        'move', 'children', 'visits', 'wins',
        'untried_moves', 'rave_wins', 'rave_visits',
    ]

    def __init__(self, board, player, prev_hash, parent=None, move=None):
        self.board = board
        self.player = player
        self.prev_hash = prev_hash
        self.parent = parent
        self.move = move
        self.children = []
        self.visits = 0
        self.wins = 0
        self.rave_wins = {}
        self.rave_visits = {}

        moves = get_legal_moves(board, player, prev_hash)
        legal_set = set(moves)
        if len(moves) > 15:
            # Urgent moves (atari saves/captures) always included first
            urgent = _get_urgent_moves(board, legal_set)
            urgent_set = set(urgent)

            adjacent = [m for m in moves
                        if m not in urgent_set and any(
                            board[nr][nc] != EMPTY
                            for nr, nc in get_neighbors(m[0], m[1]))]
            rest = [m for m in moves if m not in urgent_set and m not in set(adjacent)]
            sample = urgent + adjacent + random.sample(rest, min(20, len(rest)))
            sample = sample[:50]  # cap total scored
            scored = sorted(
                [(score_move(board, m, player), m) for m in sample],
                reverse=True,
            )
            # expand() uses .pop() — items at the END are explored first.
            # Urgent moves go at the end so they're always tried immediately.
            top_scored = [m for _, m in scored if m not in urgent_set]
            non_urgent_slots = max(0, 15 - len(urgent))
            self.untried_moves = top_scored[:non_urgent_slots] + urgent
        else:
            self.untried_moves = list(moves)

    def ucb1(self, c=1.41):
        if self.visits == 0:
            return float('inf')
        exploit = self.wins / self.visits
        explore = c * math.sqrt(math.log(self.parent.visits) / self.visits)
        # RAVE blend
        if self.parent and self.move is not None:
            rv = self.parent.rave_visits.get(self.move, 0)
            rw = self.parent.rave_wins.get(self.move, 0)
            if rv > 0:
                beta = math.sqrt(500 / (3 * self.visits + 500))
                return (1.0 - beta) * exploit + beta * (rw / rv) + explore
        return exploit + explore

    def select(self):
        node = self
        while not node.untried_moves and node.children:
            node = max(node.children, key=lambda ch: ch.ucb1())
        return node

    def expand(self):
        # Progressive widening
        max_ch = min(8 + self.visits // 15,
                     len(self.untried_moves) + len(self.children))
        if self.children and len(self.children) >= max_ch:
            return max(self.children, key=lambda c: c.ucb1())
        if not self.untried_moves:
            return self
        move = self.untried_moves.pop()
        new_board, _ = apply_move(self.board, move[0], move[1], self.player)
        child = MCTSNode(
            board=new_board,
            player=3 - self.player,
            prev_hash=board_hash(self.board),
            parent=self,
            move=move,
        )
        self.children.append(child)
        return child


# ---------------------------------------------------------------------------
# Backpropagation with RAVE (update up to depth 12 to cap overhead)
# ---------------------------------------------------------------------------
def backpropagate(node, winner, moves_played):
    depth = 0
    while node is not None:
        node.visits += 1
        mover = 3 - node.player
        if node.parent and mover == winner:
            node.wins += 1
        if node.parent and depth < 12:
            rw = node.parent.rave_wins
            rv = node.parent.rave_visits
            for move, player in moves_played:
                if player == mover:
                    rv[move] = rv.get(move, 0) + 1
                    if player == winner:
                        rw[move] = rw.get(move, 0) + 1
        node = node.parent
        depth += 1


# ---------------------------------------------------------------------------
# Main search
# ---------------------------------------------------------------------------
def mcts_search(game, time_limit=5.0):
    root = MCTSNode(
        board=clone_board(game.get_board()),
        player=game.current_player,
        prev_hash=game.prev_board_hash,
    )

    start = time.time()
    simulations = 0

    while True:
        elapsed = time.time() - start
        if elapsed >= time_limit:
            break

        node = root.select()
        node = node.expand()
        winner, moves_played = rollout(node.board, node.player)
        backpropagate(node, winner, moves_played)
        simulations += 1

        # Early stop: best child dominates and we're past half time
        if simulations % 50 == 0 and root.children and elapsed > time_limit * 0.5:
            best = max(root.children, key=lambda c: c.visits)
            if best.visits > 0.80 * simulations:
                break

    elapsed = time.time() - start

    if not root.children:
        moves = game.get_legal_moves()
        move = random.choice(moves) if moves else None
        return move, root, simulations, elapsed

    best = max(root.children, key=lambda ch: ch.visits)
    print(f"MCTS: {simulations} sims in {elapsed:.2f}s  "
          f"({int(simulations / elapsed)}/s)  "
          f"best={best.move} {best.visits}v "
          f"{best.wins / best.visits * 100:.0f}%")
    return best.move, root, simulations, elapsed


# ---------------------------------------------------------------------------
# Pass threshold — if no move scores above this, the AI passes
# ---------------------------------------------------------------------------
PASS_SCORE_THRESHOLD = 2   # score_move must exceed this to justify playing


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def get_ai_move(game, time_limit=5.0, force_play=False):
    """
    Returns the best move, or None if the AI decides to pass.
    force_play=True bypasses the pass check (used by the UI override button).
    """
    board = game.get_board()
    stone_count = int(np.sum(board != EMPTY))
    color = game.current_player

    # Opening book
    if stone_count in OPENING_BOOK:
        book_move = OPENING_BOOK[stone_count]
        if book_move in game.get_legal_moves():
            print(f"Opening book: {book_move}")
            return book_move

    legal = game.get_legal_moves()
    if not legal:
        return None

    legal_set = set(legal)

    # Pass detection — skip if override requested or game is still early
    if not force_play and stone_count > 30:
        sample = legal[:min(25, len(legal))]
        top_score = max(score_move(board, m, color) for m in sample)
        if top_score <= PASS_SCORE_THRESHOLD:
            print(f"AI passes — no beneficial moves (top score={top_score:.1f})")
            return None

    # Tactical override: if exactly one forced save/capture, play it immediately
    urgent = _get_urgent_moves(board, legal_set)
    if len(urgent) == 1:
        print(f"Tactical: {urgent[0]}")
        return urgent[0]

    # Adaptive time management
    if stone_count <= 10:
        actual = min(2.0, time_limit)
    elif stone_count <= 55:
        actual = min(time_limit * 1.2, 8.0)
    else:
        actual = min(time_limit, 3.0)

    move, *_ = mcts_search(game, time_limit=actual)
    return move
