#pragma once
#include "board.h"
#include "rules.h"
#include <vector>
#include <cstring>
#include <cmath>

constexpr float C_PUCT     = 2.0f;   // CNN PUCT exploration constant
constexpr float C_UCT      = 2.0f;   // Classic UCT exploration constant (same scale)
constexpr float RAVE_EQUIV = 3000.0f; // Fuego AMAF tuning param

// ── Single MCTS node (CNN / PUCT mode) ───────────────────────────────────────
struct MCTSNode {
    Board    board;
    int8_t   player     = BLACK;
    uint64_t prev_hash  = 0;

    float    q          = 0.0f;
    float    p          = 0.0f;
    int      n          = 0;
    int      vl         = 0;   // virtual loss counter
    int      parent     = -1;
    int      move_idx   = -1;
    bool     expanded   = false;

    int      children[TOTAL_CELLS];
    int      n_children = 0;

    MCTSNode() { std::fill(children, children + TOTAL_CELLS, -1); }
};

// ── Classic MCTS node — RAVE + heuristic prior ────────────────────────────────
struct ClassicNode {
    Board    board;
    int8_t   player     = BLACK;
    uint64_t prev_hash  = 0;

    float    q          = 0.0f;   // mean value from this player's POV
    float    p          = 0.0f;   // heuristic prior (normalized)
    int      n          = 0;
    int      parent     = -1;
    int      move_idx   = -1;
    bool     expanded   = false;
    int      n_children = 0;

    int      children[TOTAL_CELLS];
    float    rave_q[TOTAL_CELLS];   // AMAF mean value, this player's POV
    int16_t  rave_n[TOTAL_CELLS];   // AMAF visit count

    ClassicNode() {
        std::fill(children, children + TOTAL_CELLS, -1);
        std::fill(rave_q,   rave_q   + TOTAL_CELLS, 0.0f);
        std::fill(rave_n,   rave_n   + TOTAL_CELLS, (int16_t)0);
    }
    void clear_arrays() {
        std::fill(children, children + TOTAL_CELLS, -1);
        std::fill(rave_q,   rave_q   + TOTAL_CELLS, 0.0f);
        std::fill(rave_n,   rave_n   + TOTAL_CELLS, (int16_t)0);
        n_children = 0;
    }
};

// ── CNN MCTS tree (PUCT + heuristic expand) ───────────────────────────────────
class MCTSTree {
public:
    void init(int max_nodes);
    void reset(const Board& board, int8_t player, uint64_t prev_hash = 0);

    int  select();
    void expand(int node_idx, const float* policy81, float value);

    // Batched leaf collection with virtual losses
    int  gather_leaves(int max_n, int8_t* boards_out, int8_t* players_out);
    void scatter_results(int n, const float* policies, const float* values);

    int  best_move()   const;
    void visit_probs(float* out81) const;
    const MCTSNode& node(int i) const { return nodes[i]; }
    int  n_nodes()     const { return n_used; }

private:
    std::vector<MCTSNode> nodes;
    std::vector<int>      pending_leaves_;
    int n_used    = 0;
    int max_nodes = 0;

    int   alloc();
    void  backprop(int node_idx, float value);
    float puct(int parent_idx, int child_idx) const;
};

// ── Classic MCTS — RAVE + smart rollout, all in C++ ──────────────────────────
class ClassicMCTS {
public:
    explicit ClassicMCTS(int max_nodes = 100000);

    // board9x9 = flat (81,) int8 array, row-major
    void reset(const int8_t* board9x9, int8_t player, uint64_t prev_hash = 0);

    // Run all sims internally (GIL released by pybind wrapper)
    void run_sims(int n_sims, int rollout_max = 100);

    int  best_move()  const;               // flat index 0-80, or -1
    void visit_probs(float* out81) const;  // normalized visit counts
    int  n_nodes()    const { return n_used; }

private:
    std::vector<ClassicNode> nodes;
    int n_used     = 0;
    int max_nodes_ = 0;

    int   alloc();
    int   select(std::vector<int>& path);
    void  expand(int node_idx);

    // Smart rollout: urgency heuristics + eye avoidance
    // Returns +1 if `player` wins, -1 otherwise.
    // Fills rollout_moves with flat move indices played.
    float smart_rollout(Board board, int8_t player, uint64_t prev_hash,
                        int max_moves, std::vector<int>& rollout_moves);

    // Standard + RAVE backprop
    void  backprop(const std::vector<int>& path, float value,
                   const std::vector<int>& rollout_moves);

    float uct_rave(int parent_idx, int child_idx) const;
};

// ── Parallel CNN MCTS for G games ────────────────────────────────────────────
class ParallelMCTS {
public:
    ParallelMCTS(int n_games, int n_sims);

    void reset(const std::vector<Board>& boards,
               const std::vector<int8_t>& players,
               const std::vector<uint64_t>& prev_hashes);

    // Original single-leaf interface (G leaves, one per game)
    void get_leaves(int8_t* boards_out, int8_t* players_out);
    void apply_results(const float* policy, const float* value);

    // Batched interface for game 0: collect max_n leaves with virtual losses
    void gather_leaves_batch(int max_n, int8_t* boards_out, int8_t* players_out);
    void scatter_results_batch(int n, const float* policies, const float* values);

    void get_best_moves(int* out)    const;
    void get_visit_probs(float* out) const;

    int G, n_sims;

private:
    std::vector<MCTSTree> trees;
    std::vector<int>      cur_leaves;
};
