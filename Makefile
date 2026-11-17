NPM ?= npm

.PHONY: env install run test test-e2e test-ui lint build preview audit

env:
	@test -f .env || cp .env.example .env

install:
	$(NPM) ci

run:
	$(NPM) run dev

test:
	$(NPM) test

test-e2e:
	$(NPM) run test:e2e

test-ui:
	$(NPM) run test:ui

lint:
	$(NPM) run lint

build:
	$(NPM) run build

preview:
	$(NPM) run preview

audit:
	$(NPM) audit --audit-level=moderate
