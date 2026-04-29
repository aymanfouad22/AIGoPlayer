import numpy as np

BOARD_SIZE = 9
EMPTY = 0
BLACK = 1
WHITE = 2

def create_board():
    return np.zeros((BOARD_SIZE, BOARD_SIZE), dtype=np.int8)

def clone_board(board):
    return board.copy()

def get_neighbors(row, col):
    neighbors = []
    row, col = int(row), int(col)
    for dr, dc in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        r, c = row + dr, col + dc
        if 0 <= r < BOARD_SIZE and 0 <= c < BOARD_SIZE:
            neighbors.append((r, c))
    return neighbors

def board_hash(board):
    return board.tobytes()
