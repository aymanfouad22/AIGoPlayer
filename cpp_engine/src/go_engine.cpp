#include <pybind11/pybind11.h>
#include <pybind11/numpy.h>
#include <pybind11/stl.h>
#include "game.h"
#include "logger.h"
#include "mcts.h"

namespace py = pybind11;

PYBIND11_MODULE(go_engine, m) {
    m.doc() = "Fast C++ Go engine for self-play training";

    // ── Board ─────────────────────────────────────────────────────────────────
    py::class_<Board>(m, "Board")
        .def(py::init<>())
        .def("get",       &Board::get)
        .def("set",       &Board::set)
        .def("hash",      &Board::hash)
        .def("to_string", &Board::to_string)
        .def("__repr__",  &Board::to_string);

    // ── Game ──────────────────────────────────────────────────────────────────
    py::class_<Game>(m, "Game")
        .def(py::init<>())
        .def("play_move",   &Game::play_move)
        .def("pass_turn",   &Game::pass_turn)
        .def("get_legal_moves", [](const Game& g) {
            return g.get_legal_moves();   // returns std::vector<int> via stl.h
        })
        .def("is_game_over", &Game::is_game_over)
        .def("get_score", [](const Game& g) {
            auto s = g.get_score();
            py::dict d;
            d["black_score"]     = s.black_score;
            d["white_score"]     = s.white_score;
            d["winner"]          = (s.winner == BLACK) ? "Black" : "White";
            d["black_territory"] = s.black_territory;
            d["white_territory"] = s.white_territory;
            d["black_stones"]    = s.black_stones;
            d["white_stones"]    = s.white_stones;
            return d;
        })
        .def("clone",           &Game::clone)
        .def("random_rollout",  &Game::random_rollout, py::arg("max_moves") = 200)
        .def_readonly("current_player",    &Game::current_player)
        .def_readonly("move_number",       &Game::move_number)
        .def_readonly("game_over",         &Game::game_over)
        .def_readonly("last_move_index",   &Game::last_move_index)

        // Raw board as (9, 9) int8 numpy array
        .def("get_board", [](const Game& g) {
            auto arr = py::array_t<int8_t>({BOARD_SIZE, BOARD_SIZE});
            auto buf = arr.mutable_unchecked<2>();
            for (int r = 0; r < BOARD_SIZE; ++r)
                for (int c = 0; c < BOARD_SIZE; ++c)
                    buf(r, c) = g.board.get(r, c);
            return arr;
        })

        // Zero-copy encode_board → numpy (C, H, W) = (4, 9, 9)
        .def("encode_board", [](const Game& g) {
            auto arr = py::array_t<float>({4, BOARD_SIZE, BOARD_SIZE});
            g.encode_board(arr.mutable_data(), 4);
            return arr;
        })

        // Legal moves as float numpy mask shape (81,)
        .def("get_legal_moves_mask", [](const Game& g) {
            std::array<bool, TOTAL_CELLS> mask;
            g.get_legal_moves_mask(mask);
            auto arr = py::array_t<float>(TOTAL_CELLS);
            auto buf = arr.mutable_unchecked<1>();
            for (int i = 0; i < TOTAL_CELLS; ++i) buf(i) = mask[i] ? 1.0f : 0.0f;
            return arr;
        })
        .def("__repr__", &Game::to_string);

    // ── Batch self-play (pure C++, returns training data) ────────────────────
    m.def("batch_self_play",
        [](int num_games, int max_moves) {
            LOG_INFO("Starting batch self-play: " + std::to_string(num_games) + " games");

            std::vector<py::dict> all_games;
            all_games.reserve(num_games);

            for (int gi = 0; gi < num_games; ++gi) {
                Game game;
                std::vector<std::array<float, 4*TOTAL_CELLS>> boards;
                std::vector<int> moves;
                boards.reserve(max_moves);
                moves.reserve(max_moves);

                while (!game.is_game_over() && game.move_number < max_moves) {
                    std::array<float, 4*TOTAL_CELLS> enc;
                    game.encode_board(enc.data(), 4);
                    boards.push_back(enc);

                    auto legal = game.get_legal_moves();
                    if (legal.empty()) { game.pass_turn(); continue; }

                    int m_idx = legal[rand() % (int)legal.size()];
                    moves.push_back(m_idx);
                    game.play_move(m_idx / BOARD_SIZE, m_idx % BOARD_SIZE);
                }

                auto sc = game.get_score();

                py::dict gd;
                auto boards_np = py::array_t<float>(
                    {(int)boards.size(), 4, BOARD_SIZE, BOARD_SIZE});
                if (!boards.empty())
                    memcpy(boards_np.mutable_data(), boards.data(),
                           boards.size() * 4 * TOTAL_CELLS * sizeof(float));
                gd["boards"]      = boards_np;
                gd["moves"]       = moves;
                gd["winner"]      = (int)sc.winner;
                gd["black_score"] = sc.black_score;
                gd["white_score"] = sc.white_score;
                all_games.push_back(gd);

                if ((gi + 1) % 100 == 0)
                    LOG_INFO("Completed " + std::to_string(gi+1) + "/" +
                             std::to_string(num_games) + " games");
            }
            Logger::instance().print_perf_summary();
            return all_games;
        },
        py::arg("num_games") = 1000, py::arg("max_moves") = 200);

    // ── ParallelMCTS ─────────────────────────────────────────────────────────
    py::class_<ParallelMCTS>(m, "ParallelMCTS")
        .def(py::init<int, int>(), py::arg("n_games"), py::arg("n_sims"))

        // reset(boards_np (G,9,9) int8, players_np (G,) int8, hashes_np (G,) uint64)
        .def("reset", [](ParallelMCTS& self,
                         py::array_t<int8_t,  py::array::c_style> boards_np,
                         py::array_t<int8_t,  py::array::c_style> players_np,
                         py::array_t<uint64_t, py::array::c_style> hashes_np)
        {
            auto b = boards_np.unchecked<3>();
            auto p = players_np.unchecked<1>();
            auto h = hashes_np.unchecked<1>();
            std::vector<Board>    boards(self.G);
            std::vector<int8_t>   players(self.G);
            std::vector<uint64_t> hashes(self.G);
            for (int g = 0; g < self.G; ++g) {
                for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
                    int8_t v = b(g, idx / BOARD_SIZE, idx % BOARD_SIZE);
                    if (v != EMPTY) boards[g].set_idx(idx, v);
                }
                players[g] = p(g);
                hashes[g]  = h(g);
            }
            self.reset(boards, players, hashes);
        },
        py::arg("boards"), py::arg("players"), py::arg("prev_hashes"))

        // get_leaves() -> (boards (G,9,9) int8, players (G,) int8)
        .def("get_leaves", [](ParallelMCTS& self) {
            auto boards_out  = py::array_t<int8_t>({self.G, BOARD_SIZE, BOARD_SIZE});
            auto players_out = py::array_t<int8_t>({self.G});
            self.get_leaves(boards_out.mutable_data(), players_out.mutable_data());
            return py::make_tuple(boards_out, players_out);
        })

        // apply_results(policy (G,81) float32, value (G,) float32)
        .def("apply_results", [](ParallelMCTS& self,
                                  py::array_t<float, py::array::c_style> policy_np,
                                  py::array_t<float, py::array::c_style> value_np)
        {
            self.apply_results(policy_np.data(), value_np.data());
        },
        py::arg("policy"), py::arg("value"))

        // gather_leaves_batch(max_n) -> (max_n,9,9) int8, (max_n,) int8
        .def("gather_leaves_batch", [](ParallelMCTS& self, int max_n) {
            auto boards_out  = py::array_t<int8_t>({max_n, BOARD_SIZE, BOARD_SIZE});
            auto players_out = py::array_t<int8_t>({max_n});
            self.gather_leaves_batch(max_n, boards_out.mutable_data(), players_out.mutable_data());
            return py::make_tuple(boards_out, players_out);
        }, py::arg("max_n"))

        // scatter_results_batch(policy (N,81) float32, value (N,) float32)
        .def("scatter_results_batch", [](ParallelMCTS& self,
                                          py::array_t<float, py::array::c_style> policy_np,
                                          py::array_t<float, py::array::c_style> value_np)
        {
            int n = (int)policy_np.shape(0);
            self.scatter_results_batch(n, policy_np.data(), value_np.data());
        }, py::arg("policy"), py::arg("value"))

        // get_best_moves() -> (G,) int32
        .def("get_best_moves", [](const ParallelMCTS& self) {
            auto out = py::array_t<int>({self.G});
            self.get_best_moves(out.mutable_data());
            return out;
        })

        // get_visit_probs() -> (G, 81) float32
        .def("get_visit_probs", [](const ParallelMCTS& self) {
            auto out = py::array_t<float>({self.G, TOTAL_CELLS});
            self.get_visit_probs(out.mutable_data());
            return out;
        })

        .def_readonly("G",      &ParallelMCTS::G)
        .def_readonly("n_sims", &ParallelMCTS::n_sims);

    // ── ClassicMCTS — RAVE + smart rollout + heuristic priors, all in C++ ──────
    py::class_<ClassicMCTS>(m, "ClassicMCTS")
        .def(py::init<int>(), py::arg("max_nodes") = 100000)

        // reset(board_np (81,) or (9,9) int8, player int8, prev_hash uint64)
        .def("reset", [](ClassicMCTS& self,
                         py::array_t<int8_t, py::array::c_style> board_np,
                         int8_t player, uint64_t prev_hash)
        {
            // Accept (81,) or (9,9) — data() is always flat and contiguous
            self.reset(board_np.data(), player, prev_hash);
        }, py::arg("board"), py::arg("player"), py::arg("prev_hash") = 0)

        // run_sims releases GIL so Python can do other work while C++ runs
        .def("run_sims", [](ClassicMCTS& self, int n_sims, int rollout_max) {
            py::gil_scoped_release release;
            self.run_sims(n_sims, rollout_max);
        }, py::arg("n_sims") = 800, py::arg("rollout_max") = 100)

        .def("best_move", &ClassicMCTS::best_move)

        .def("visit_probs", [](const ClassicMCTS& self) {
            auto out = py::array_t<float>(TOTAL_CELLS);
            self.visit_probs(out.mutable_data());
            return out;
        })

        .def("n_nodes", &ClassicMCTS::n_nodes);

    // ── Batch random rollout from arbitrary board states ─────────────────────
    // boards_np: (G,9,9) int8, players_np: (G,) int8
    // returns:   (G,) float32 — +1 if current player wins, -1 otherwise
    m.def("batch_rollout", [](
        py::array_t<int8_t,  py::array::c_style> boards_np,
        py::array_t<int8_t,  py::array::c_style> players_np,
        int max_moves)
    {
        int G  = (int)boards_np.shape(0);
        auto out = py::array_t<float>({G});
        auto b   = boards_np.unchecked<3>();
        auto p   = players_np.unchecked<1>();
        auto o   = out.mutable_unchecked<1>();

        #pragma omp parallel for schedule(static)
        for (int g = 0; g < G; ++g) {
            Game game;
            for (int idx = 0; idx < TOTAL_CELLS; ++idx) {
                int8_t v = b(g, idx / BOARD_SIZE, idx % BOARD_SIZE);
                if (v != EMPTY) game.board.set_idx(idx, v);
            }
            game.current_player = p(g);
            int8_t winner = game.random_rollout(max_moves);
            o(g) = (winner == p(g)) ? 1.0f : -1.0f;
        }
        return out;
    }, py::arg("boards"), py::arg("players"), py::arg("max_moves") = 100);

    // ── Logger controls ───────────────────────────────────────────────────────
    m.def("set_log_level", [](const std::string& lv) {
        if      (lv == "debug")   Logger::instance().set_level(LogLevel::DEBUG);
        else if (lv == "info")    Logger::instance().set_level(LogLevel::INFO);
        else if (lv == "perf")    Logger::instance().set_level(LogLevel::PERF);
        else if (lv == "warning") Logger::instance().set_level(LogLevel::WARNING);
        else if (lv == "error")   Logger::instance().set_level(LogLevel::ERROR);
    });
    m.def("set_log_file",       [](const std::string& p) { Logger::instance().set_file(p); });
    m.def("print_perf_summary", []() { Logger::instance().print_perf_summary(); });
    m.def("start_timer",        [](const std::string& l) { Logger::instance().start_timer(l); });
    m.def("stop_timer",         [](const std::string& l) { Logger::instance().stop_timer(l); });
}
