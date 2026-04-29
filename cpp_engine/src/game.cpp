#include "game.h"
#include "logger.h"
#include <cstdlib>
#include <iostream>
#include <sstream>
#include <algorithm>
#include <random>

Game::Game() {
    board_history.reserve(256);
}

bool Game::play_move(int row, int col) {
    if (game_over) return false;
    if (!is_legal_move(board, row, col, current_player, board_history)) return false;

    board_history.insert(board.hash());
    int captured = apply_move(board, row, col, current_player);
    captures[current_player] += captured;

    last_move_index  = row * BOARD_SIZE + col;
    consecutive_passes = 0;
    ++move_number;
    current_player = (int8_t)(3 - current_player);
    return true;
}

void Game::pass_turn() {
    if (game_over) return;
    board_history.insert(board.hash());
    last_move_index = -1;
    ++consecutive_passes;
    ++move_number;
    if (consecutive_passes >= 2) {
        game_over = true;
    } else {
        current_player = (int8_t)(3 - current_player);
    }
}

std::vector<int> Game::get_legal_moves() const {
    return ::get_legal_moves(board, current_player, board_history);
}

void Game::get_legal_moves_mask(std::array<bool, TOTAL_CELLS>& mask) const {
    ::get_legal_moves_mask(board, current_player, board_history, mask);
}

ScoreResult Game::get_score() const {
    return compute_score(board);
}

// 4-channel encoding matching integrate_cnn.py:
//   ch0 = black stones, ch1 = white stones
//   ch2 = current_player-1 plane (0.0 if BLACK, 1.0 if WHITE)
//   ch3 = legal moves mask
void Game::encode_board(float* out, int /*num_channels*/) const {
    float cp_plane = (float)(current_player - 1);  // 0 if BLACK, 1 if WHITE

    std::array<bool, TOTAL_CELLS> legal_mask;
    get_legal_moves_mask(legal_mask);

    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        int8_t v = board.get_idx(idx);
        out[0 * TOTAL_CELLS + idx] = (v == BLACK) ? 1.0f : 0.0f;  // ch0 black
        out[1 * TOTAL_CELLS + idx] = (v == WHITE) ? 1.0f : 0.0f;  // ch1 white
        out[2 * TOTAL_CELLS + idx] = cp_plane;                      // ch2 current player
        out[3 * TOTAL_CELLS + idx] = legal_mask[idx] ? 1.0f : 0.0f;// ch3 legal
    }
}

int8_t Game::random_rollout(int max_moves) const {
    Game tmp = clone();
    thread_local std::mt19937 rng(std::random_device{}());

    int safety = 0;
    while (!tmp.game_over && safety < max_moves) {
        ++safety;
        auto moves = tmp.get_legal_moves();
        if (moves.empty()) {
            tmp.pass_turn();
        } else {
            std::uniform_int_distribution<int> dist(0, (int)moves.size() - 1);
            int m = moves[dist(rng)];
            tmp.play_move(m / BOARD_SIZE, m % BOARD_SIZE);
        }
    }
    auto sc = tmp.get_score();
    return sc.winner;
}

Game Game::clone() const {
    return *this;   // board_history, board, etc. all value-copy
}

std::string Game::to_string() const {
    std::ostringstream oss;
    oss << board.to_string();
    oss << "Player: " << (current_player == BLACK ? "BLACK" : "WHITE")
        << "  Move: " << move_number
        << "  B-cap: " << captures[BLACK] << "  W-cap: " << captures[WHITE] << '\n';
    return oss.str();
}

void Game::print_board() const {
    std::cout << to_string();
}
