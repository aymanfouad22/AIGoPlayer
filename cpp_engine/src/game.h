#pragma once
#include "board.h"
#include "rules.h"
#include "scoring.h"
#include <unordered_set>
#include <vector>

class Game {
public:
    Board   board;
    int8_t  current_player   = BLACK;
    int     captures[3]      = {0, 0, 0};   // [BLACK], [WHITE]
    int     last_move_index  = -1;
    bool    game_over        = false;
    int     move_number      = 0;
    int     consecutive_passes = 0;

    std::unordered_set<uint64_t> board_history;

    Game();

    bool play_move(int row, int col);
    void pass_turn();

    std::vector<int>  get_legal_moves() const;
    void              get_legal_moves_mask(std::array<bool, TOTAL_CELLS>& mask) const;

    ScoreResult get_score() const;
    bool        is_game_over() const { return game_over; }

    // Writes 4-channel board encoding into float buffer (layout: [C][H][W])
    void encode_board(float* out, int num_channels) const;

    // Random rollout from current state; returns BLACK or WHITE.
    int8_t random_rollout(int max_moves = 200) const;

    Game clone() const;

    std::string to_string() const;
    void        print_board() const;
};
