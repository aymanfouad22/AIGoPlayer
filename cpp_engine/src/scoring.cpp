#include "scoring.h"
#include "rules.h"
#include <array>
#include <vector>

// Remove dead stones from a working copy (matches Python _remove_dead_stones)
static void remove_all_dead(Board& b) {
    bool changed = true;
    while (changed) {
        changed = false;
        std::array<bool, TOTAL_CELLS> processed = {};
        for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
            int8_t c = b.get_idx(idx);
            if (c == EMPTY || processed[idx]) continue;
            auto gi = get_group(b, idx);
            for (int s : gi.stones) processed[s] = true;
            if (gi.liberties.empty()) {
                for (int s : gi.stones) b.set_idx(s, EMPTY);
                changed = true;
            }
        }
    }
}

ScoreResult compute_score(const Board& board) {
    Board w = board;
    remove_all_dead(w);

    ScoreResult r{};
    // Count stones
    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        if (w.get_idx(idx) == BLACK) r.black_stones++;
        else if (w.get_idx(idx) == WHITE) r.white_stones++;
    }

    // Flood-fill territory
    std::array<bool, TOTAL_CELLS> visited = {};
    std::vector<int> queue;
    queue.reserve(TOTAL_CELLS);

    for (int start = 0; start < TOTAL_CELLS; ++start) {
        if (visited[start] || w.get_idx(start) != EMPTY) continue;
        queue.clear();
        queue.push_back(start);
        visited[start] = true;
        std::vector<int> region;
        bool touches_black = false, touches_white = false;

        for (int qi = 0; qi < (int)queue.size(); ++qi) {
            int idx = queue[qi];
            region.push_back(idx);
            for (int nb : Board::neighbors(idx)) {
                int8_t nv = w.get_idx(nb);
                if (nv == BLACK) touches_black = true;
                else if (nv == WHITE) touches_white = true;
                else if (!visited[nb]) {
                    visited[nb] = true;
                    queue.push_back(nb);
                }
            }
        }

        if (touches_black && !touches_white) {
            r.black_territory += (int)region.size();
        } else if (touches_white && !touches_black) {
            r.white_territory += (int)region.size();
        }
    }

    r.black_score = (float)(r.black_stones + r.black_territory);
    r.white_score = (float)(r.white_stones + r.white_territory) + KOMI;
    r.winner      = (r.black_score > r.white_score) ? BLACK : WHITE;
    return r;
}
