#include "rules.h"
#include <algorithm>

// ── Thread-local BFS storage (avoids heap allocation per call) ────────────────
namespace {
    thread_local std::vector<int> tl_queue;
    thread_local std::vector<int> tl_visited_list;
    thread_local std::array<bool, TOTAL_CELLS> tl_visited = {};
}

// ── Group BFS ─────────────────────────────────────────────────────────────────

GroupInfo get_group(const Board& board, int start) {
    GroupInfo g;
    int8_t color = board.get_idx(start);
    if (color == EMPTY) return g;

    // Reset only previously-visited cells
    for (int i : tl_visited_list) tl_visited[i] = false;
    tl_visited_list.clear();
    tl_queue.clear();

    tl_queue.push_back(start);
    tl_visited[start] = true;
    tl_visited_list.push_back(start);

    while (!tl_queue.empty()) {
        int idx = tl_queue.back(); tl_queue.pop_back();
        g.stones.push_back(idx);
        for (int nb : Board::neighbors(idx)) {
            if (tl_visited[nb]) continue;
            tl_visited[nb] = true;
            tl_visited_list.push_back(nb);
            int8_t nv = board.get_idx(nb);
            if (nv == color)  tl_queue.push_back(nb);
            else if (nv == EMPTY) g.liberties.push_back(nb);
        }
    }
    // Remove duplicate liberties
    std::sort(g.liberties.begin(), g.liberties.end());
    g.liberties.erase(std::unique(g.liberties.begin(), g.liberties.end()), g.liberties.end());
    return g;
}

// ── Remove dead stones ────────────────────────────────────────────────────────

int remove_dead_stones(Board& board, int8_t color) {
    // Track which stone roots we've already processed
    std::array<bool, TOTAL_CELLS> processed = {};
    int removed = 0;

    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        if (board.get_idx(idx) != color || processed[idx]) continue;
        auto gi = get_group(board, idx);
        for (int s : gi.stones) processed[s] = true;
        if (gi.liberties.empty()) {
            for (int s : gi.stones) board.set_idx(s, EMPTY);
            removed += (int)gi.stones.size();
        }
    }
    return removed;
}

// ── Legality check ────────────────────────────────────────────────────────────

bool is_legal_move(const Board& board, int row, int col, int8_t color,
                   const std::unordered_set<uint64_t>& history) {
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return false;
    if (board.get(row, col) != EMPTY) return false;

    Board tmp = board;
    tmp.set(row, col, color);

    int8_t opp = 3 - color;
    remove_dead_stones(tmp, opp);

    // Suicide check
    auto gi = get_group(tmp, row * BOARD_SIZE + col);
    if (gi.liberties.empty()) return false;

    // Ko check
    if (!history.empty() && history.count(tmp.hash())) return false;

    return true;
}

// ── Apply move ────────────────────────────────────────────────────────────────

int apply_move(Board& board, int row, int col, int8_t color) {
    board.set(row, col, color);
    int8_t opp = 3 - color;
    return remove_dead_stones(board, opp);
}

// ── Legal moves list ──────────────────────────────────────────────────────────

std::vector<int> get_legal_moves(const Board& board, int8_t color,
                                  const std::unordered_set<uint64_t>& history) {
    std::vector<int> moves;
    moves.reserve(TOTAL_CELLS);
    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        int r = idx / BOARD_SIZE, c = idx % BOARD_SIZE;
        if (is_legal_move(board, r, c, color, history)) moves.push_back(idx);
    }
    return moves;
}

// ── Fast liberty count (no heap allocation) ───────────────────────────────────

int count_liberties(const Board& board, int start) {
    int8_t color = board.get_idx(start);
    if (color == EMPTY) return 0;

    for (int i : tl_visited_list) tl_visited[i] = false;
    tl_visited_list.clear();
    tl_queue.clear();

    tl_queue.push_back(start);
    tl_visited[start] = true;
    tl_visited_list.push_back(start);

    int lib_count = 0;
    while (!tl_queue.empty()) {
        int idx = tl_queue.back(); tl_queue.pop_back();
        for (int nb : Board::neighbors(idx)) {
            if (tl_visited[nb]) continue;
            tl_visited[nb] = true;
            tl_visited_list.push_back(nb);
            int8_t nv = board.get_idx(nb);
            if (nv == color)  tl_queue.push_back(nb);
            else if (nv == EMPTY) lib_count++;
        }
    }
    return lib_count;
}

int get_atari_liberty(const Board& board, int start) {
    int8_t color = board.get_idx(start);
    if (color == EMPTY) return -1;

    for (int i : tl_visited_list) tl_visited[i] = false;
    tl_visited_list.clear();
    tl_queue.clear();

    tl_queue.push_back(start);
    tl_visited[start] = true;
    tl_visited_list.push_back(start);

    int lib_cell = -1, lib_count = 0;
    while (!tl_queue.empty()) {
        int idx = tl_queue.back(); tl_queue.pop_back();
        for (int nb : Board::neighbors(idx)) {
            if (tl_visited[nb]) continue;
            tl_visited[nb] = true;
            tl_visited_list.push_back(nb);
            int8_t nv = board.get_idx(nb);
            if (nv == color) {
                tl_queue.push_back(nb);
            } else if (nv == EMPTY) {
                lib_count++;
                lib_cell = nb;
                if (lib_count > 1) return -1;  // early exit — not in atari
            }
        }
    }
    return (lib_count == 1) ? lib_cell : -1;
}

int get_atari_liberty_mark(const Board& board, int start,
                            std::array<bool, TOTAL_CELLS>& proc) {
    int8_t color = board.get_idx(start);
    if (color == EMPTY) return -1;

    for (int i : tl_visited_list) tl_visited[i] = false;
    tl_visited_list.clear();
    tl_queue.clear();

    tl_queue.push_back(start);
    tl_visited[start] = true;
    tl_visited_list.push_back(start);
    proc[start] = true;

    int lib_cell = -1, lib_count = 0;
    while (!tl_queue.empty()) {
        int idx = tl_queue.back(); tl_queue.pop_back();
        for (int nb : Board::neighbors(idx)) {
            if (tl_visited[nb]) continue;
            tl_visited[nb] = true;
            tl_visited_list.push_back(nb);
            int8_t nv = board.get_idx(nb);
            if (nv == color) {
                tl_queue.push_back(nb);
                proc[nb] = true;   // mark every stone in the group
            } else if (nv == EMPTY) {
                lib_count++;
                if (lib_count == 1) lib_cell = nb;
                else lib_cell = -1;  // >1 liberty → not atari, keep going to mark group
            }
        }
    }
    return (lib_count == 1) ? lib_cell : -1;
}

void get_legal_moves_mask(const Board& board, int8_t color,
                           const std::unordered_set<uint64_t>& history,
                           std::array<bool, TOTAL_CELLS>& mask) {
    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        int r = idx / BOARD_SIZE, c = idx % BOARD_SIZE;
        mask[idx] = is_legal_move(board, r, c, color, history);
    }
}
