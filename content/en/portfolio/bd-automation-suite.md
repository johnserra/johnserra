---
title: "BD Automation Suite"
description: "A modular Python pipeline that automates multi-stream business development — from prospect research to outreach drafting — with all business logic in YAML and humans firmly in the loop."
date: "2025-01-01"
tags: ["python", "automation", "business-development", "ai", "crm"]
status: "published"
coverImage: "/images/projects/bd-automation-suite.jpg"
githubUrl: "https://github.com/johnserra/bd-automation-suite"
---

## The Problem

Business development work is repetitive by design: find prospects, enrich their data, score them, follow up on schedule, draft outreach. Most of that work doesn't require human judgment — it just requires consistency. The problem is that doing it consistently, across multiple BD streams, at any real volume, is too slow to do manually and too fragile to cobble together with spreadsheets.

## The Architecture

The suite runs as seven discrete modules, each responsible for one stage of the pipeline:

1. **Prospect Research** — pulls new targets from external data sources based on per-stream search configs
2. **Contact Discovery** — finds decision-maker contacts for qualified leads
3. **Lead Enrichment** — populates structured fields from multiple external adapters
4. **Lead Scoring** — applies weighted YAML-defined criteria to produce a numeric score
5. **Outreach Drafter** — uses Claude to write personalized first-touch emails (drafts only — never auto-sent)
6. **Follow-up Scheduler** — creates CRM activities based on pipeline stage and days-since rules
7. **Pipeline Reporter** — generates weekly Markdown summaries of pipeline health

All modules write to Odoo CRM as the central data hub. All modules support `--dry-run`.

## The Key Design Decisions

**YAML-driven business logic.** Scoring weights, enrichment sources, follow-up thresholds, and outreach tone live in config files, not code. Adapting the suite to a new BD context means editing YAML, not touching Python.

**Adapter pattern for external data.** Every external source — Google Maps, trade databases, company websites, news — is a self-contained adapter that never raises. On failure it returns `success=False`. The orchestrating module moves on. This keeps the pipeline resilient to spotty third-party APIs.

**Idempotency throughout.** Every module is safe to re-run. Deduplication on lead creation, duplicate-checking before activity creation. Cron jobs can be re-triggered without creating junk data.

**Human in the loop on outreach.** The outreach module uses Claude Sonnet to draft emails and writes them to a CRM field for human review. Nothing is ever sent automatically. The automation handles the research and drafting; a person handles the relationship.

**Haiku for scale, Sonnet for quality.** Batch enrichment summarization uses Claude Haiku (cheap, fast). Outreach drafts use Claude Sonnet (higher quality). The distinction is explicit via named constants in the shared LLM client.

## What It Replaced

Manual prospect research in spreadsheets, ad-hoc follow-up reminders, and inconsistent lead data. The pipeline now runs on a cron schedule — prospect research and reporting weekly, follow-up scheduling and scoring daily.

## What I Learned

The hardest part wasn't the code — it was defining the scoring criteria precisely enough to encode them in YAML. Forcing that precision was the real value. Vague intuitions about what makes a good lead don't survive contact with a config file that demands explicit weights and thresholds.
