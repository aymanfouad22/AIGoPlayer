#pragma once
#include <array>
#include <vector>
#include <string>
#include <cstdint>

constexpr int BOARD_SIZE  = 9;
constexpr int TOTAL_CELLS = 81;
constexpr int8_t EMPTY = 0;
constexpr int8_t BLACK = 1;
constexpr int8_t WHITE = 2;

using BoardArray = std::array<int8_t, TOTAL_CELLS>;

class Board {
public:
    BoardArray cells{};
    uint64_t   current_hash = 0;

    Board();
    Board(const Board&) = default;
    Board& operator=(const Board&) = default;

    int8_t  get(int row, int col) const  { return cells[row * BOARD_SIZE + col]; }
    int8_t  get_idx(int idx) const       { return cells[idx]; }
    void    set(int row, int col, int8_t value);
    void    set_idx(int idx, int8_t value);

    uint64_t hash() const { return current_hash; }

    static const std::vector<int>& neighbors(int idx);

    std::string to_string() const;
    bool operator==(const Board& o) const { return cells == o.cells; }

private:
    static std::array<std::vector<int>, TOTAL_CELLS> s_neighbors;
    static std::array<std::array<uint64_t, 3>, TOTAL_CELLS> s_zobrist;
    static bool s_init;
    static void init_tables();
};
