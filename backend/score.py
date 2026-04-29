import numpy as np
from board import EMPTY, BLACK, WHITE, BOARD_SIZE, get_neighbors

KOMI = 2.5

def _remove_dead_stones(board):
    """Remove groups with no liberties iteratively. Returns cleaned board copy."""
    working = board.copy()
    changed = True
    while changed:
        changed = False
        visited = set()
        for r in range(BOARD_SIZE):
            for c in range(BOARD_SIZE):
                if working[r][c] == EMPTY or (r, c) in visited:
                    continue
                color = working[r][c]
                group, liberties, seen = [], set(), {(r, c)}
                stack = [(r, c)]
                while stack:
                    cr, cc = stack.pop()
                    group.append((cr, cc))
                    for nr, nc in get_neighbors(cr, cc):
                        if (nr, nc) in seen:
                            continue
                        seen.add((nr, nc))
                        if working[nr][nc] == EMPTY:
                            liberties.add((nr, nc))
                        elif working[nr][nc] == color:
                            stack.append((nr, nc))
                visited.update(group)
                if not liberties:
                    for gr, gc in group:
                        working[gr][gc] = EMPTY
                    changed = True
    return working


def compute_territory(board):
    working = _remove_dead_stones(board)
    visited = set()
    black_territory = set()
    white_territory = set()

    for row in range(BOARD_SIZE):
        for col in range(BOARD_SIZE):
            if (row, col) in visited or working[row][col] != EMPTY:
                continue
            region = []
            queue = [(row, col)]
            visited.add((row, col))
            touches_black = False
            touches_white = False

            while queue:
                r, c = queue.pop()
                region.append((r, c))
                for nr, nc in get_neighbors(r, c):
                    if working[nr][nc] == BLACK:
                        touches_black = True
                    elif working[nr][nc] == WHITE:
                        touches_white = True
                    elif (nr, nc) not in visited:
                        visited.add((nr, nc))
                        queue.append((nr, nc))

            if touches_black and not touches_white:
                black_territory.update(region)
            elif touches_white and not touches_black:
                white_territory.update(region)

    return black_territory, white_territory

def compute_score(board):
    black_territory, white_territory = compute_territory(board)
    black_stones = int(np.sum(board == BLACK))
    white_stones = int(np.sum(board == WHITE))
    black_score = len(black_territory) + black_stones
    white_score = len(white_territory) + white_stones + KOMI
    winner = "Black" if black_score > white_score else "White"

    return {
        "black_score": black_score,
        "white_score": white_score,
        "black_territory": len(black_territory),
        "white_territory": len(white_territory),
        "black_stones": black_stones,
        "white_stones": white_stones,
        "winner": winner
    }
