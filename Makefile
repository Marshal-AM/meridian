# Meridian Phase 0 — build orchestration
# Requires: dpm (Daml SDK 3.4.11), pnpm, Node 20+

SDK_VERSION := 3.4.11
DAML_DIR := daml

.PHONY: install-daml build-daml test-daml build-ts test-ts codegen \
        bootstrap verify all allocate-devnet upload-dar-devnet smoke-devnet test-phase1-devnet test-phase1-stack test-phase2-devnet test-phase2-stack test-phase3-devnet test-phase3-stack bootstrap-cash-devnet build-splice-dars

build-splice-dars:
	wsl bash infra/scripts/build-splice-dars.sh

bootstrap-cash-devnet:
	pnpm bootstrap:cash:devnet

test-phase3-devnet:
	pnpm test:phase3:devnet

test-phase3-stack:
	pnpm test:phase3:stack

install-daml:
	curl -fsSL https://get.digitalasset.com/install/install.sh | sh
	dpm install $(SDK_VERSION)

build-daml:
	wsl bash infra/scripts/build-daml-wsl.sh

test-daml:
	wsl bash infra/scripts/run-daml-tests.sh

build-redstone-dars:
	wsl bash infra/scripts/build-redstone-dars.sh

build-ts:
	pnpm install
	pnpm build

test-ts:
	pnpm test

codegen:
	node scripts/codegen.js

bootstrap:
	powershell -ExecutionPolicy Bypass -File infra/scripts/bootstrap-devnet.ps1

verify:
	powershell -ExecutionPolicy Bypass -File infra/scripts/verify-devnet.ps1

allocate-devnet:
	pnpm allocate:devnet

upload-dar-devnet:
	pnpm upload:dar:devnet

fund-devnet:
	pnpm fund:devnet

smoke-devnet:
	pnpm smoke:devnet

test-phase1-devnet:
	pnpm test:phase1:devnet

test-phase1-stack:
	pnpm test:phase1:stack

test-phase2-devnet:
	pnpm test:phase2:devnet

test-phase2-stack:
	pnpm test:phase2:stack

all: build-daml build-ts test-daml test-ts
