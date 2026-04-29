#pragma once
#include "board.h"

constexpr float KOMI = 2.5f;

struct ScoreResult {
    float   black_score;
    float   white_score;
    int     black_stones;
    int     white_stones;
    int     black_territory;
    int     white_territory;
    int8_t  winner;   // BLACK or WHITE
};

ScoreResult compute_score(const Board& board);
