#pragma once
#include <string>
#include <fstream>
#include <mutex>
#include <unordered_map>
#include <chrono>

enum class LogLevel { DEBUG = 0, INFO = 1, PERF = 2, WARNING = 3, ERROR = 4 };

class Logger {
public:
    static Logger& instance();

    void set_level(LogLevel lv)           { level = lv; }
    void set_file(const std::string& path);
    void enable_console(bool on)          { console = on; }

    void log(LogLevel lv, const std::string& msg);
    void log_move(int gid, int mnum, int8_t player, int row, int col, bool legal);
    void log_capture(int gid, int8_t color, int count, int row, int col);
    void log_game_end(int gid, int8_t winner, float bs, float ws, int moves);
    void log_perf(const std::string& op, double ms, int count = 1);

    void start_timer(const std::string& label);
    void stop_timer(const std::string& label);
    void print_perf_summary();

private:
    Logger() = default;
    Logger(const Logger&) = delete;

    LogLevel     level   = LogLevel::INFO;
    bool         console = true;
    std::ofstream fs;
    std::mutex   mtx;

    using Clock = std::chrono::high_resolution_clock;

    struct PerfStat {
        double total_ms = 0; int count = 0;
        double min_ms = 1e9, max_ms = 0;
    };
    std::unordered_map<std::string, PerfStat>  stats;
    std::unordered_map<std::string, Clock::time_point> timers;

    std::string timestamp();
    void write(const std::string& line);
};

#define LOG_DEBUG(m)        Logger::instance().log(LogLevel::DEBUG,   m)
#define LOG_INFO(m)         Logger::instance().log(LogLevel::INFO,    m)
#define LOG_WARN(m)         Logger::instance().log(LogLevel::WARNING, m)
#define LOG_ERROR(m)        Logger::instance().log(LogLevel::ERROR,   m)
#define LOG_PERF(op,ms,n)   Logger::instance().log_perf(op, ms, n)
