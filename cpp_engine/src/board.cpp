#include "board.h"
#include <random>
#include <sstream>

// ── Static member definitions ─────────────────────────────────────────────────
std::array<std::vector<int>, TOTAL_CELLS>          Board::s_neighbors;
std::array<std::array<uint64_t, 3>, TOTAL_CELLS>   Board::s_zobrist;
bool Board::s_init = false;

void Board::init_tables() {
    // Neighbour table
    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        int r = idx / BOARD_SIZE, c = idx % BOARD_SIZE;
        auto& nb = s_neighbors[idx];
        if (r > 0)              nb.push_back((r-1)*BOARD_SIZE + c);
        if (r < BOARD_SIZE-1)   nb.push_back((r+1)*BOARD_SIZE + c);
        if (c > 0)              nb.push_back(r*BOARD_SIZE + (c-1));
        if (c < BOARD_SIZE-1)   nb.push_back(r*BOARD_SIZE + (c+1));
    }
    // Zobrist table (color 0=EMPTY contributes 0 implicitly)
    std::mt19937_64 rng(0xDEADBEEFCAFEBABEULL);
    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        s_zobrist[idx][0] = 0;
        s_zobrist[idx][1] = rng();
        s_zobrist[idx][2] = rng();
    }
    s_init = true;
}

// ── Board ─────────────────────────────────────────────────────────────────────

Board::Board() {
    if (!s_init) init_tables();
    cells.fill(EMPTY);
    current_hash = 0;
}

void Board::set(int row, int col, int8_t value) {
    set_idx(row * BOARD_SIZE + col, value);
}

void Board::set_idx(int idx, int8_t value) {
    int8_t old = cells[idx];
    if (old != EMPTY) current_hash ^= s_zobrist[idx][old];
    cells[idx] = value;
    if (value != EMPTY) current_hash ^= s_zobrist[idx][value];
}

const std::vector<int>& Board::neighbors(int idx) {
    if (!s_init) init_tables();
    return s_neighbors[idx];
}

std::string Board::to_string() const {
    std::ostringstream oss;
    oss << "   ";
    for (int c = 0; c < BOARD_SIZE; ++c) oss << (char)('A'+c) << ' ';
    oss << '\n';
    for (int r = 0; r < BOARD_SIZE; ++r) {
        oss << (r+1 < 10 ? " " : "") << (r+1) << ' ';
        for (int c = 0; c < BOARD_SIZE; ++c) {
            int8_t v = get(r,c);
            oss << (v == BLACK ? 'X' : v == WHITE ? 'O' : '.') << ' ';
        }
        oss << '\n';
    }
    return oss.str();
}
