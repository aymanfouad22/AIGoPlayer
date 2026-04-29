from board import EMPTY, BOARD_SIZE, clone_board, board_hash, get_neighbors

def get_group(board, row, col):
    color = board[row][col]
    if color == EMPTY:
        return set(), set()

    group = set()
    liberties = set()
    queue = [(row, col)]
    visited = {(row, col)}

    while queue:
        r, c = queue.pop()
        group.add((r, c))

        for nr, nc in get_neighbors(r, c):
            if (nr, nc) in visited:
                continue
            visited.add((nr, nc))

            if board[nr][nc] == color:
                queue.append((nr, nc))
            elif board[nr][nc] == EMPTY:
                liberties.add((nr, nc))

    return group, liberties

def remove_dead_stones(board, color):
    to_remove = set()
    visited = set()
    for row in range(BOARD_SIZE):
        for col in range(BOARD_SIZE):
            if board[row][col] == color and (row, col) not in visited:
                group, liberties = get_group(board, row, col)
                visited.update(group)
                if not liberties:
                    to_remove.update(group)

    for r, c in to_remove:
        board[r][c] = EMPTY

    return len(to_remove)

def is_legal_move(board, row, col, color, prev_board_hash):
    if row < 0 or row >= BOARD_SIZE or col < 0 or col >= BOARD_SIZE:
        return False

    if board[row][col] != EMPTY:
        return False

    temp_board = clone_board(board)
    temp_board[row][col] = color

    opponent = 3 - color
    remove_dead_stones(temp_board, opponent)

    _, liberties = get_group(temp_board, row, col)
    if not liberties:
        return False

    if prev_board_hash:
        h = board_hash(temp_board)
        if isinstance(prev_board_hash, set):
            if h in prev_board_hash:
                return False
        elif h == prev_board_hash:
            return False

    return True

def apply_move(board, row, col, color):
    new_board = clone_board(board)
    new_board[row][col] = color

    opponent = 3 - color
    captured = remove_dead_stones(new_board, opponent)

    return new_board, captured

def get_legal_moves(board, color, prev_board_hash=None):
    legal_moves = []
    for row in range(BOARD_SIZE):
        for col in range(BOARD_SIZE):
            if is_legal_move(board, row, col, color, prev_board_hash):
                legal_moves.append((row, col))
    return legal_moves
