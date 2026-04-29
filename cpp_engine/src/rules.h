#pragma once
#include "board.h"
#include <unordered_set>

struct GroupInfo {
    std::vector<int> stones;
    std::vector<int> liberties;
};

GroupInfo get_group(const Board& board, int idx);

// Removes all groups of `color` with no liberties; returns count removed.
int remove_dead_stones(Board& board, int8_t color);

bool is_legal_move(const Board& board, int row, int col, int8_t color,
                   const std::unordered_set<uint64_t>& history);

// Places stone, removes opponent dead stones; returns capture count.
// Modifies board in-place. Caller must ensure move is legal.
int apply_move(Board& board, int row, int col, int8_t color);

std::vector<int> get_legal_moves(const Board& board, int8_t color,
                                 const std::unordered_set<uint64_t>& history);

void get_legal_moves_mask(const Board& board, int8_t color,
                          const std::unordered_set<uint64_t>& history,
                          std::array<bool, TOTAL_CELLS>& mask);

// Fast liberty count — no heap allocation (uses thread-local BFS).
// Returns 0 if idx is empty.
int count_liberties(const Board& board, int idx);

// Returns the single liberty cell of a group in atari, or -1 if liberty count != 1.
int get_atari_liberty(const Board& board, int idx);

// Same as get_atari_liberty but also marks every stone in the group in `proc`.
// Use this inside a loop that scans all cells to avoid re-BFSing the same group.
int get_atari_liberty_mark(const Board& board, int idx,
                            std::array<bool, TOTAL_CELLS>& proc);
