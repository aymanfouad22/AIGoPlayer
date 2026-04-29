# Stage 1: Compile C++ engine for Linux
FROM python:3.12-slim AS cpp-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake g++ make \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir pybind11

WORKDIR /build
COPY cpp_engine/ .
RUN mkdir build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release \
             -Dpybind11_DIR=$(python3 -c "import pybind11; print(pybind11.get_cmake_dir())") && \
    make -j$(nproc)

# Stage 2: Runtime
FROM python:3.12-slim

WORKDIR /app

# Install PyTorch CPU wheel before other deps (large layer, cache-friendly)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir fastapi "uvicorn[standard]" pydantic numpy

COPY backend/ .
# Replace the Windows .pyd with the Linux .so compiled above
COPY --from=cpp-builder /build/build/go_engine*.so .

EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
