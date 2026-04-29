#include "logger.h"
#include <iostream>
#include <sstream>
#include <iomanip>
#include <ctime>

Logger& Logger::instance() {
    static Logger inst;
    return inst;
}

void Logger::set_file(const std::string& path) {
    std::lock_guard<std::mutex> lk(mtx);
    fs.open(path, std::ios::app);
}

std::string Logger::timestamp() {
    using Clock = std::chrono::high_resolution_clock;
    static auto start = Clock::now();
    auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(Clock::now() - start).count();
    long h  = ms / 3600000; ms %= 3600000;
    long m  = ms / 60000;   ms %= 60000;
    long s  = ms / 1000;    ms %= 1000;
    std::ostringstream o;
    o << std::setfill('0') << std::setw(2) << h << ':'
      << std::setw(2) << m << ':' << std::setw(2) << s << '.'
      << std::setw(3) << ms;
    return o.str();
}

static const char* level_str(LogLevel lv) {
    switch (lv) {
        case LogLevel::DEBUG:   return "DEBUG  ";
        case LogLevel::INFO:    return "INFO   ";
        case LogLevel::PERF:    return "PERF   ";
        case LogLevel::WARNING: return "WARNING";
        case LogLevel::ERROR:   return "ERROR  ";
    }
    return "INFO   ";
}

void Logger::write(const std::string& line) {
    if (console) std::cout << line << '\n';
    if (fs.is_open()) fs << line << '\n';
}

void Logger::log(LogLevel lv, const std::string& msg) {
    if (lv < level) return;
    std::lock_guard<std::mutex> lk(mtx);
    write('[' + std::string(level_str(lv)) + ' ' + timestamp() + "] " + msg);
}

void Logger::log_move(int gid, int mnum, int8_t player, int row, int col, bool legal) {
    if (LogLevel::DEBUG < level) return;
    std::ostringstream o;
    o << "Game " << gid << " Move " << mnum << ": "
      << (player == 1 ? "BLACK" : "WHITE") << " plays (" << row << ',' << col << ')'
      << (legal ? " — legal" : " — ILLEGAL");
    log(LogLevel::DEBUG, o.str());
}

void Logger::log_capture(int gid, int8_t color, int count, int row, int col) {
    if (LogLevel::DEBUG < level) return;
    std::ostringstream o;
    o << "Game " << gid << ": captures " << count
      << (color == 1 ? " BLACK" : " WHITE") << " stones at (" << row << ',' << col << ')';
    log(LogLevel::DEBUG, o.str());
}

void Logger::log_game_end(int gid, int8_t winner, float bs, float ws, int moves) {
    std::ostringstream o;
    o << "Game " << gid << " ended: " << (winner == 1 ? "BLACK" : "WHITE")
      << " wins (B:" << bs << ", W:" << ws << ") in " << moves << " moves";
    log(LogLevel::INFO, o.str());
}

void Logger::log_perf(const std::string& op, double ms, int count) {
    std::lock_guard<std::mutex> lk(mtx);
    auto& s = stats[op];
    s.total_ms += ms;
    s.count    += count;
    if (ms < s.min_ms) s.min_ms = ms;
    if (ms > s.max_ms) s.max_ms = ms;
}

void Logger::start_timer(const std::string& label) {
    std::lock_guard<std::mutex> lk(mtx);
    timers[label] = Clock::now();
}

void Logger::stop_timer(const std::string& label) {
    auto now = Clock::now();
    std::lock_guard<std::mutex> lk(mtx);
    auto it = timers.find(label);
    if (it == timers.end()) return;
    double ms = std::chrono::duration<double, std::milli>(now - it->second).count();
    auto& s = stats[label];
    s.total_ms += ms; s.count++;
    if (ms < s.min_ms) s.min_ms = ms;
    if (ms > s.max_ms) s.max_ms = ms;
    timers.erase(it);
}

void Logger::print_perf_summary() {
    std::lock_guard<std::mutex> lk(mtx);
    std::ostringstream o;
    o << "=== Performance Summary ===\n";
    for (auto& [name, s] : stats) {
        if (s.count == 0) continue;
        o << "  " << name
          << ": avg=" << std::fixed << std::setprecision(3) << s.total_ms/s.count << "ms"
          << "  min=" << s.min_ms << "ms"
          << "  max=" << s.max_ms << "ms"
          << "  calls=" << s.count << '\n';
    }
    write(o.str());
}
