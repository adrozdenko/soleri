---
id: principle-tooling-capture-soleri-development-principle-salvador-is-the-refer
title: "Soleri Development Principle: Salvador is the Reference Implementation"
category: tooling
severity: critical
tier: captured
tags:
  - soleri
  - architecture
  - salvador-reference
  - feature-parity
knowledge_type: principle
created: 2026-03-04
curator_version: 1
status: published
confidence: 1
source: unknown
---

# Soleri Development Principle: Salvador is the Reference Implementation

## Context

Established during Cognee integration work when feature audit revealed massive gap between generated agents and Salvador capabilities.

## Principle

Every engine-level feature in Salvador MCP should exist in every Soleri-generated agent. Salvador's code is the blueprint — port features from Salvador into @soleri/core and @soleri/forge, don't reinvent. Generated agents must be Salvador-grade (minus domain-specific design system intelligence). Curator, brain intelligence pipeline, loops, orchestration, identity, governance — all engine features. Currently generated agents have ~36 ops across 2 facades; Salvador has 181+ ops across 14 facades. See GitHub milestones v5.1–v7.0.

## Example

N/A

## Why

Without this principle, Soleri agents ship as toy demos instead of production-grade knowledge management platforms. Salvador has battle-tested every feature; porting is faster and more reliable than reimplementing.
