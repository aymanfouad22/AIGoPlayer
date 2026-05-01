# Stage 1: Compile C++ engine for Linux (same OS as runtime to match libstdc++)
FROM ubuntu:22.04 AS cpp-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake g++ make python3.10 python3.10-dev python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --no-cache-dir pybind11

WORKDIR /build
COPY cpp_engine/ .
RUN mkdir build && cd build && \
    cmake .. -DCMAKE_BUILD_TYPE=Release \
             -Dpybind11_DIR=$(python3.10 -c "import pybind11; print(pybind11.get_cmake_dir())") && \
    make -j$(nproc)

# Stage 2: Runtime with CUDA (12.6+ required for RTX 5090 Blackwell)
FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu22.04

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3.10 python3.10-venv python3-pip \
    && rm -rf /var/lib/apt/lists/*

RUN python3.10 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app

# Install CUDA-enabled PyTorch (cu126 + PyTorch 2.6+ for Blackwell/sm_120 support)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cu126 && \
    pip install --no-cache-dir fastapi "uvicorn[standard]" pydantic numpy

COPY backend/ .
# Replace the Windows .pyd with the Linux .so compiled above
COPY --from=cpp-builder /build/build/go_engine*.so .

EXPOSE 8000
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000"]
