from board import create_board, clone_board, board_hash, BLACK, WHITE
from rules import is_legal_move, apply_move, get_legal_moves
from score import compute_score

class Game:
    def __init__(self):
        self.board = create_board()
        self.current_player = BLACK
        self.captures = {BLACK: 0, WHITE: 0}
        self.prev_board_hash = None
        self.board_history = set()
        self.last_move = None
        self.game_over = False
        self.consecutive_passes = 0
        self._undo_stack = []

    def _snapshot(self):
        return {
            'board': self.board.copy(),
            'current_player': self.current_player,
            'captures': dict(self.captures),
            'prev_board_hash': self.prev_board_hash,
            'board_history': set(self.board_history),
            'last_move': self.last_move,
            'game_over': self.game_over,
            'consecutive_passes': self.consecutive_passes,
        }

    def _restore(self, snap):
        self.board = snap['board']
        self.current_player = snap['current_player']
        self.captures = snap['captures']
        self.prev_board_hash = snap['prev_board_hash']
        self.board_history = snap['board_history']
        self.last_move = snap['last_move']
        self.game_over = snap['game_over']
        self.consecutive_passes = snap['consecutive_passes']

    def play_move(self, row, col):
        if self.game_over:
            return False
        if not is_legal_move(self.board, row, col, self.current_player,
                              self.board_history or self.prev_board_hash):
            return False

        self._undo_stack.append(self._snapshot())
        self.board_history.add(board_hash(self.board))
        self.prev_board_hash = board_hash(self.board)
        self.board, captured = apply_move(self.board, row, col, self.current_player)
        self.captures[self.current_player] += captured
        self.last_move = (row, col)
        self.consecutive_passes = 0
        self.current_player = 3 - self.current_player
        return True

    def pass_turn(self):
        """Pass this turn. Game ends when both players pass consecutively."""
        if self.game_over:
            return
        self._undo_stack.append(self._snapshot())
        self.consecutive_passes += 1
        self.last_move = None
        if self.consecutive_passes >= 2:
            self.game_over = True
        else:
            self.current_player = 3 - self.current_player

    def undo(self):
        """Undo the last move or pass. Returns True if successful."""
        if not self._undo_stack:
            return False
        self._restore(self._undo_stack.pop())
        return True

    def get_board(self):
        return self.board

    def get_legal_moves(self):
        return get_legal_moves(self.board, self.current_player,
                               self.board_history or self.prev_board_hash)

    def get_score(self):
        return compute_score(self.board)

    def is_game_over(self):
        return self.game_over
