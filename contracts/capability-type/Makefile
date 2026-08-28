SHELL := /bin/bash
TARGET := riscv64imac-unknown-none-elf
BINARY := target/$(TARGET)/release/capability-type

.PHONY: build test clean

build:
	RUSTFLAGS="-C passes=lower-atomic" cargo build --release --target $(TARGET)
	@mkdir -p build/release
	cp $(BINARY) build/release/capability-type

# The integration tests load the RISC-V binary from build/release.
test: build
	CAPABILITY_BIN=$$(pwd)/build/release/capability-type cargo test --test contract

clean:
	cargo clean
	rm -rf build
