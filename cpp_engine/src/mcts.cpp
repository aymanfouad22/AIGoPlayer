#include "mcts.h"
#include "rules.h"
#include "scoring.h"
#include <algorithm>
#include <cstring>
#include <cmath>
#include <random>

#ifdef _OPENMP
#include <omp.h>
#endif

// ── Shared heuristic constants ────────────────────────────────────────────────
constexpr float HEURISTIC_BLEND = 0.25f;
constexpr float URGENT_MULT     = 3.0f;

// ── Heuristic prior score for one move ───────────────────────────────────────
static float heuristic_score(const Board& board, int idx, int8_t player) {
    int8_t opp = (int8_t)(3 - player);
    int r = idx / BOARD_SIZE;
    int c = idx % BOARD_SIZE;
    float score = 0.0f;

    score += (float)((4 - std::abs(r - 4)) + (4 - std::abs(c - 4)));
    if (r >= 2 && r <= 6 && c >= 2 && c <= 6) score += 3.0f;
    if (r == 0 || r == BOARD_SIZE-1 || c == 0 || c == BOARD_SIZE-1) score -= 6.0f;
    else if (r == 1 || r == BOARD_SIZE-2 || c == 1 || c == BOARD_SIZE-2) score -= 2.0f;

    const auto& nbrs = Board::neighbors(idx);
    int own_cnt = 0, opp_cnt = 0;
    bool eye_candidate = ((int)nbrs.size() == 4);

    for (int ni : nbrs) {
        int8_t cell = board.get_idx(ni);
        if (cell == player) {
            own_cnt++;
            auto gi = get_group(board, ni);
            if (gi.liberties.size() == 1) score += 15.0f;
        } else if (cell == opp) {
            opp_cnt++;
            eye_candidate = false;
            auto gi = get_group(board, ni);
            if (gi.liberties.size() == 1) {
                score += ((int)gi.stones.size() == 1) ? 12.0f
                                                       : (20.0f + 3.0f * (float)gi.stones.size());
            } else if (gi.liberties.size() == 2) {
                score += 8.0f;
            }
        } else {
            eye_candidate = false;
        }
    }

    score += own_cnt * 4.0f;
    score += opp_cnt * 3.0f;

    if (eye_candidate) score -= 30.0f;

    return score;
}

// ── Simple eye detection for rollouts ────────────────────────────────────────
static bool is_simple_eye(const Board& board, int idx, int8_t player) {
    for (int ni : Board::neighbors(idx)) {
        if (board.get_idx(ni) != player) return false;
    }
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// MCTSTree (CNN PUCT)
// ─────────────────────────────────────────────────────────────────────────────

void MCTSTree::init(int max_nodes_) {
    nodes.resize(max_nodes_);
    max_nodes = max_nodes_;
    n_used    = 0;
}

void MCTSTree::reset(const Board& board, int8_t player, uint64_t prev_hash) {
    n_used = 0;
    pending_leaves_.clear();
    int root_idx = alloc();
    MCTSNode& r  = nodes[root_idx];
    std::fill(r.children, r.children + TOTAL_CELLS, -1);
    r.board      = board;
    r.player     = player;
    r.prev_hash  = prev_hash;
    r.q          = 0.0f;
    r.p          = 1.0f;
    r.n          = 0;
    r.vl         = 0;
    r.parent     = -1;
    r.move_idx   = -1;
    r.expanded   = false;
    r.n_children = 0;
}

int MCTSTree::alloc() {
    if (n_used >= max_nodes) return -1;
    return n_used++;
}

float MCTSTree::puct(int parent_idx, int child_idx) const {
    const MCTSNode& par = nodes[parent_idx];
    const MCTSNode& ch  = nodes[child_idx];
    float q_val = (ch.n > 0) ? -ch.q : 0.0f;
    return q_val + C_PUCT * ch.p * std::sqrt((float)par.n) / (1.0f + ch.n);
}

int MCTSTree::select() {
    int cur = 0;
    while (nodes[cur].expanded && nodes[cur].n_children > 0) {
        // Apply virtual loss before choosing child
        MCTSNode& nd = nodes[cur];
        float old_sum = nd.q * (float)nd.n - 1.0f;
        nd.n++;
        nd.vl++;
        nd.q = old_sum / (float)nd.n;

        float best_score = -1e30f;
        int   best_child = -1;
        for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
            int ci = nd.children[idx];
            if (ci < 0) continue;
            float s = puct(cur, ci);
            if (s > best_score) { best_score = s; best_child = ci; }
        }
        if (best_child < 0) break;
        cur = best_child;
    }
    // Apply virtual loss to leaf
    MCTSNode& leaf = nodes[cur];
    float old_sum = leaf.q * (float)leaf.n - 1.0f;
    leaf.n++;
    leaf.vl++;
    leaf.q = (leaf.n > 0) ? old_sum / (float)leaf.n : -1.0f;
    return cur;
}

void MCTSTree::expand(int node_idx, const float* policy81, float value) {
    MCTSNode& nd = nodes[node_idx];
    if (!nd.expanded) nd.expanded = true;

    int8_t   player    = nd.player;
    int8_t   opp       = (int8_t)(3 - player);
    uint64_t prev_hash = nd.prev_hash;

    std::array<bool,  TOTAL_CELLS> legal{};
    std::array<float, TOTAL_CELLS> h_scores{};
    float total_prior = 0.0f, total_h = 0.0f;
    int   n_legal = 0;

    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        if (nd.board.get_idx(idx) != EMPTY) continue;
        Board tmp = nd.board;
        tmp.set(idx / BOARD_SIZE, idx % BOARD_SIZE, player);
        remove_dead_stones(tmp, opp);
        auto gi = get_group(tmp, idx);
        if (gi.liberties.empty()) continue;
        if (prev_hash != 0 && tmp.hash() == prev_hash) continue;

        legal[idx]    = true;
        total_prior  += policy81[idx];
        float hs = heuristic_score(nd.board, idx, player);
        h_scores[idx] = (hs > 0.0f) ? hs : 0.0f;
        total_h      += h_scores[idx];
        ++n_legal;
    }

    float prior_scale = (total_prior > 1e-8f) ? 1.0f / total_prior : 0.0f;
    float h_scale     = (total_h    > 1e-8f) ? 1.0f / total_h     : 0.0f;
    float uniform_p   = (n_legal > 0) ? 1.0f / (float)n_legal : 0.0f;

    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        if (!legal[idx]) continue;
        int ci = alloc();
        if (ci < 0) break;

        float cnn_p   = (prior_scale > 0) ? policy81[idx] * prior_scale : uniform_p;
        float h_p     = (h_scale     > 0) ? h_scores[idx] * h_scale     : uniform_p;
        float blended = (1.0f - HEURISTIC_BLEND) * cnn_p + HEURISTIC_BLEND * h_p;

        MCTSNode& child  = nodes[ci];
        std::fill(child.children, child.children + TOTAL_CELLS, -1);
        child.board      = nd.board;
        child.player     = opp;
        child.prev_hash  = nd.board.hash();
        child.q          = 0.0f;
        child.p          = blended;
        child.n          = 0;
        child.vl         = 0;
        child.parent     = node_idx;
        child.move_idx   = idx;
        child.expanded   = false;
        child.n_children = 0;

        apply_move(child.board, idx / BOARD_SIZE, idx % BOARD_SIZE, player);

        nd.children[idx] = ci;
        nd.n_children++;
    }

    backprop(node_idx, value);
}

void MCTSTree::backprop(int node_idx, float value) {
    float v   = value;
    int   cur = node_idx;
    while (cur >= 0) {
        MCTSNode& nd = nodes[cur];
        // Undo one virtual loss (-1 was added during select)
        if (nd.vl > 0) {
            float real_sum = nd.q * (float)nd.n + 1.0f;
            nd.n--;
            nd.vl--;
            nd.q = (nd.n > 0) ? real_sum / (float)nd.n : 0.0f;
        }
        nd.n++;
        nd.q += (v - nd.q) / (float)nd.n;
        v    = -v;
        cur  = nd.parent;
    }
}

int MCTSTree::best_move() const {
    const MCTSNode& root = nodes[0];
    int best_ci = -1, best_n = -1;
    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        int ci = root.children[idx];
        if (ci >= 0 && nodes[ci].n > best_n) {
            best_n  = nodes[ci].n;
            best_ci = ci;
        }
    }
    return (best_ci >= 0) ? nodes[best_ci].move_idx : -1;
}

void MCTSTree::visit_probs(float* out81) const {
    std::fill(out81, out81 + TOTAL_CELLS, 0.0f);
    const MCTSNode& root = nodes[0];
    int total_n = 0;
    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        int ci = root.children[idx];
        if (ci >= 0) total_n += nodes[ci].n;
    }
    if (total_n == 0) return;
    float scale = 1.0f / (float)total_n;
    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        int ci = root.children[idx];
        if (ci >= 0) out81[idx] = nodes[ci].n * scale;
    }
}

int MCTSTree::gather_leaves(int max_n, int8_t* boards_out, int8_t* players_out) {
    pending_leaves_.clear();
    pending_leaves_.reserve(max_n);
    for (int i = 0; i < max_n; ++i) {
        int leaf = select();
        pending_leaves_.push_back(leaf);
        const MCTSNode& nd = nodes[leaf];
        std::memcpy(boards_out + i * TOTAL_CELLS, nd.board.cells.data(), TOTAL_CELLS);
        players_out[i] = nd.player;
    }
    return (int)pending_leaves_.size();
}

void MCTSTree::scatter_results(int n, const float* policies, const float* values) {
    for (int i = 0; i < n; ++i)
        expand(pending_leaves_[i], policies + i * TOTAL_CELLS, values[i]);
    pending_leaves_.clear();
}

// ─────────────────────────────────────────────────────────────────────────────
// ClassicMCTS — RAVE + smart rollout + heuristic priors
// ─────────────────────────────────────────────────────────────────────────────

ClassicMCTS::ClassicMCTS(int max_nodes)
    : max_nodes_(max_nodes) {
    nodes.resize(max_nodes);
}

int ClassicMCTS::alloc() {
    if (n_used >= max_nodes_) return -1;
    return n_used++;
}

void ClassicMCTS::reset(const int8_t* board9x9, int8_t player, uint64_t prev_hash) {
    n_used = 0;
    int root_idx = alloc();
    ClassicNode& r = nodes[root_idx];
    r.clear_arrays();
    // Rebuild board from flat array
    r.board = Board();
    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        if (board9x9[idx] != EMPTY)
            r.board.set_idx(idx, board9x9[idx]);
    }
    r.player     = player;
    r.prev_hash  = prev_hash;
    r.q          = 0.0f;
    r.p          = 1.0f;
    r.n          = 0;
    r.parent     = -1;
    r.move_idx   = -1;
    r.expanded   = false;
}

// UCT-RAVE selection score from parent's perspective
float ClassicMCTS::uct_rave(int parent_idx, int child_idx) const {
    const ClassicNode& par = nodes[parent_idx];
    const ClassicNode& ch  = nodes[child_idx];
    int move = ch.move_idx;

    // MCTS Q from parent's perspective (child stores from its own perspective)
    float q_mcts = (ch.n > 0) ? -ch.q : 0.0f;

    // RAVE Q from parent's RAVE table (stored from parent's perspective)
    float   q_rave = 0.0f;
    int16_t rn     = (move >= 0 && move < TOTAL_CELLS) ? par.rave_n[move] : 0;
    if (rn > 0) q_rave = par.rave_q[move];

    // β = rave_n / (rave_n + n + rave_n*n / k)  (Fuego formula)
    float beta = 0.0f;
    if (rn > 0 || ch.n > 0) {
        float denom = (float)rn + (float)ch.n
                      + (float)rn * (float)ch.n / RAVE_EQUIV;
        beta = (denom > 0.0f) ? std::min((float)rn / denom, 1.0f) : 0.0f;
    }

    float q_combined = (1.0f - beta) * q_mcts + beta * q_rave;

    // PUCT-style exploration with heuristic prior
    float explore = (par.n > 0)
        ? C_UCT * ch.p * std::sqrt((float)par.n) / (1.0f + (float)ch.n)
        : 0.0f;

    return q_combined + explore;
}

int ClassicMCTS::select(std::vector<int>& path) {
    int cur = 0;
    path.clear();
    path.push_back(cur);

    while (nodes[cur].expanded && nodes[cur].n_children > 0) {
        float best    = -1e30f;
        int   best_ci = -1;
        for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
            int ci = nodes[cur].children[idx];
            if (ci < 0) continue;
            float s = uct_rave(cur, ci);
            if (s > best) { best = s; best_ci = ci; }
        }
        if (best_ci < 0) break;
        cur = best_ci;
        path.push_back(cur);
    }
    return cur;
}

void ClassicMCTS::expand(int node_idx) {
    ClassicNode& nd = nodes[node_idx];
    nd.expanded = true;

    int8_t   player    = nd.player;
    int8_t   opp       = (int8_t)(3 - player);
    uint64_t prev_hash = nd.prev_hash;

    std::array<float, TOTAL_CELLS> h_scores{};
    std::array<bool,  TOTAL_CELLS> legal{};
    float total_h = 0.0f;
    int   n_legal = 0;

    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        if (nd.board.get_idx(idx) != EMPTY) continue;

        Board tmp = nd.board;
        tmp.set(idx / BOARD_SIZE, idx % BOARD_SIZE, player);
        remove_dead_stones(tmp, opp);
        auto gi = get_group(tmp, idx);
        if (gi.liberties.empty()) continue;
        if (prev_hash != 0 && tmp.hash() == prev_hash) continue;

        legal[idx] = true;
        float hs = heuristic_score(nd.board, idx, player);
        // Minimum 1.0 so uniform is a floor
        h_scores[idx] = (hs > 0.0f) ? hs + 1.0f : 1.0f;
        total_h      += h_scores[idx];
        ++n_legal;
    }

    if (n_legal == 0) return;

    float h_scale = 1.0f / total_h;

    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        if (!legal[idx]) continue;
        int ci = alloc();
        if (ci < 0) break;

        ClassicNode& child = nodes[ci];
        child.clear_arrays();
        child.board      = nd.board;
        child.player     = opp;
        child.prev_hash  = nd.board.hash();
        child.q          = 0.0f;
        child.p          = h_scores[idx] * h_scale;
        child.n          = 0;
        child.parent     = node_idx;
        child.move_idx   = idx;
        child.expanded   = false;

        apply_move(child.board, idx / BOARD_SIZE, idx % BOARD_SIZE, player);

        nd.children[idx] = ci;
        nd.n_children++;
    }
}

float ClassicMCTS::smart_rollout(Board board, int8_t player, uint64_t prev_hash,
                                  int max_moves, std::vector<int>& rollout_moves) {
    thread_local std::mt19937 rng(std::random_device{}());
    rollout_moves.clear();

    int8_t cp     = player;
    int    passes = 0;

    for (int step = 0; step < max_moves && passes < 2; ++step) {
        int8_t opp = (int8_t)(3 - cp);

        // ── Step 1: precompute urgency mask (one BFS per group, no heap alloc) ─
        // urgent_cell[i] = true  ↔  playing at i captures or saves an atari group
        std::array<bool, TOTAL_CELLS> urgent_cell{};
        {
            std::array<bool, TOTAL_CELLS> proc{};
            for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
                if (board.get_idx(idx) == EMPTY || proc[idx]) continue;
                // get_atari_liberty_mark does a single BFS and marks every stone
                // in the group as processed — each group is BFS-ed exactly once.
                int lib = get_atari_liberty_mark(board, idx, proc);
                if (lib >= 0) urgent_cell[lib] = true;
            }
        }

        // ── Step 2: classify legal moves ─────────────────────────────────────────
        int urgent[TOTAL_CELLS], nu = 0;
        int normal[TOTAL_CELLS], nn = 0;

        for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
            if (board.get_idx(idx) != EMPTY) continue;

            // Fast legality: any empty neighbor → not suicide.
            // Skip ko check on this fast path (ko is rare; rollout quality unaffected).
            bool has_empty_nbr = false;
            for (int ni : Board::neighbors(idx)) {
                if (board.get_idx(ni) == EMPTY) { has_empty_nbr = true; break; }
            }

            if (!has_empty_nbr) {
                // Rare case (no direct liberty) — need full legality check.
                Board tmp = board;
                tmp.set_idx(idx, cp);
                remove_dead_stones(tmp, opp);
                auto gi = get_group(tmp, idx);
                if (gi.liberties.empty()) continue;   // suicide
                if (tmp.hash() == prev_hash) continue; // ko
            }

            // Eye check: all neighbors are own color → skip
            if (is_simple_eye(board, idx, cp)) continue;

            // Urgency from precomputed mask
            if (urgent_cell[idx]) urgent[nu++] = idx;
            else                  normal[nn++] = idx;
        }

        if (nu + nn == 0) { passes++; cp = opp; continue; }
        passes = 0;

        int chosen = (nu > 0)
            ? urgent[std::uniform_int_distribution<int>(0, nu - 1)(rng)]
            : normal[std::uniform_int_distribution<int>(0, nn - 1)(rng)];

        rollout_moves.push_back(chosen);
        prev_hash = board.hash();
        apply_move(board, chosen / BOARD_SIZE, chosen % BOARD_SIZE, cp);
        cp = opp;
    }

    auto sc = compute_score(board);
    return (sc.winner == player) ? 1.0f : -1.0f;
}

void ClassicMCTS::backprop(const std::vector<int>& path, float value,
                            const std::vector<int>& rollout_moves) {
    // value = result from nodes[path.back()].player's perspective
    // Walk from leaf to root, flipping sign at each level
    int   n = (int)path.size();
    float v = value;

    for (int i = n - 1; i >= 0; --i) {
        ClassicNode& nd = nodes[path[i]];

        // Standard MCTS update
        nd.n++;
        nd.q += (v - nd.q) / (float)nd.n;

        // RAVE update for tree moves after this node
        for (int j = i + 1; j < n; ++j) {
            int m = nodes[path[j]].move_idx;
            if (m >= 0 && m < TOTAL_CELLS && nd.rave_n[m] < 30000) {
                nd.rave_n[m]++;
                nd.rave_q[m] += (v - nd.rave_q[m]) / (float)nd.rave_n[m];
            }
        }

        // RAVE update for rollout moves
        for (int m : rollout_moves) {
            if (m >= 0 && m < TOTAL_CELLS && nd.rave_n[m] < 30000) {
                nd.rave_n[m]++;
                nd.rave_q[m] += (v - nd.rave_q[m]) / (float)nd.rave_n[m];
            }
        }

        v = -v; // flip perspective for parent
    }
}

void ClassicMCTS::run_sims(int n_sims, int rollout_max) {
    std::vector<int> path;
    std::vector<int> rollout_moves;
    path.reserve(200);
    rollout_moves.reserve(rollout_max + 10);

    for (int s = 0; s < n_sims; ++s) {
        int leaf = select(path);

        if (!nodes[leaf].expanded)
            expand(leaf);

        float value = smart_rollout(
            nodes[leaf].board,
            nodes[leaf].player,
            nodes[leaf].prev_hash,
            rollout_max,
            rollout_moves
        );

        backprop(path, value, rollout_moves);
    }
}

int ClassicMCTS::best_move() const {
    const ClassicNode& root = nodes[0];
    int best_ci = -1, best_n = -1;
    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        int ci = root.children[idx];
        if (ci >= 0 && nodes[ci].n > best_n) {
            best_n  = nodes[ci].n;
            best_ci = ci;
        }
    }
    return (best_ci >= 0) ? nodes[best_ci].move_idx : -1;
}

void ClassicMCTS::visit_probs(float* out81) const {
    std::fill(out81, out81 + TOTAL_CELLS, 0.0f);
    const ClassicNode& root = nodes[0];
    int total_n = 0;
    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        int ci = root.children[idx];
        if (ci >= 0) total_n += nodes[ci].n;
    }
    if (total_n == 0) return;
    float scale = 1.0f / (float)total_n;
    for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
        int ci = root.children[idx];
        if (ci >= 0) out81[idx] = (float)nodes[ci].n * scale;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// ParallelMCTS (CNN mode, G games)
// ─────────────────────────────────────────────────────────────────────────────

ParallelMCTS::ParallelMCTS(int n_games, int n_sims_)
    : G(n_games), n_sims(n_sims_), trees(n_games), cur_leaves(n_games, 0) {
    int max_nodes = n_sims * 60 + 300;
    for (auto& t : trees) t.init(max_nodes);
}

void ParallelMCTS::reset(const std::vector<Board>& boards,
                          const std::vector<int8_t>& players,
                          const std::vector<uint64_t>& prev_hashes) {
    for (int g = 0; g < G; ++g)
        trees[g].reset(boards[g], players[g], prev_hashes[g]);
}

void ParallelMCTS::get_leaves(int8_t* boards_out, int8_t* players_out) {
    #pragma omp parallel for schedule(static)
    for (int g = 0; g < G; ++g) {
        int leaf = trees[g].select();
        cur_leaves[g] = leaf;
        const MCTSNode& nd = trees[g].node(leaf);
        std::memcpy(boards_out + g * TOTAL_CELLS, nd.board.cells.data(), TOTAL_CELLS);
        players_out[g] = nd.player;
    }
}

void ParallelMCTS::apply_results(const float* policy, const float* value) {
    #pragma omp parallel for schedule(static)
    for (int g = 0; g < G; ++g)
        trees[g].expand(cur_leaves[g], policy + g * TOTAL_CELLS, value[g]);
}

void ParallelMCTS::get_best_moves(int* out) const {
    for (int g = 0; g < G; ++g) out[g] = trees[g].best_move();
}

void ParallelMCTS::get_visit_probs(float* out) const {
    for (int g = 0; g < G; ++g)
        trees[g].visit_probs(out + g * TOTAL_CELLS);
}

void ParallelMCTS::gather_leaves_batch(int max_n, int8_t* boards_out, int8_t* players_out) {
    trees[0].gather_leaves(max_n, boards_out, players_out);
}

void ParallelMCTS::scatter_results_batch(int n, const float* policies, const float* values) {
    trees[0].scatter_results(n, policies, values);
}
