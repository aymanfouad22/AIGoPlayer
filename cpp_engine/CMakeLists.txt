cmake_minimum_required(VERSION 3.14)
project(go_engine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(MSVC)
    add_compile_options(/O2 /arch:AVX2 /DNDEBUG)
else()
    add_compile_options(-O3 -march=native -DNDEBUG)
endif()

find_package(OpenMP)
find_package(pybind11 REQUIRED)

pybind11_add_module(go_engine
    src/board.cpp
    src/rules.cpp
    src/scoring.cpp
    src/game.cpp
    src/logger.cpp
    src/mcts.cpp
    src/go_engine.cpp
)

target_include_directories(go_engine PRIVATE src)

if(OpenMP_CXX_FOUND)
    target_link_libraries(go_engine PRIVATE OpenMP::OpenMP_CXX)
    message(STATUS "OpenMP enabled")
else()
    message(STATUS "OpenMP not found — running single-threaded")
endif()
