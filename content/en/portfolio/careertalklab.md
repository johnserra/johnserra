---
title: "CareerTalkLab"
description: "A standalone hybrid LMS for Turkish professionals learning English — built with Next.js 16, Supabase, and Claude AI to scale high-quality ESL instruction without scaling teacher hours."
date: "2026-03-01"
tags: ["next.js", "supabase", "ai", "education", "lms"]
status: "published"
coverImage: "/images/projects/careertalklab.jpg"
liveUrl: "https://careertalklab.com"
---

## The Problem

Teaching English to Turkish business professionals is high-value work, but it doesn't scale. Every student needs personalized feedback, progress tracking, scheduling coordination, and live practice sessions. At any volume beyond a handful of students, the admin overhead consumes more time than the actual teaching.

The challenge: build a system that delivers the same quality of instruction to 50 students that a private tutor delivers to 5 — without hiring additional staff.

## The Solution

CareerTalkLab is a standalone hybrid LMS at careertalklab.com. It uses a "Flipped Classroom" model: students complete web-based input (grammar, vocabulary, professional tasks) through a custom portal, reserving live Google Meet sessions exclusively for high-value output — speaking practice, strategic feedback, and real-time role-play.

The system runs two tracks:

- **Exam Track** (~90% of students) — IELTS/TOEFL candidates working through self-paced modules with auto-progression. High automation, subscription-based revenue.
- **Executive Track** (~10% of students) — Business professionals starting at A1/A2, learning through task-based "Survival Sprints" framed around professional functions, not grammar rules. Premium pricing, high-touch engagement.

## The Architecture

CareerTalkLab is a separate Next.js 16 project with its own domain and Vercel deployment, sharing a Supabase backend with johnserra.com.

| Layer | Technology |
|---|---|
| Frontend | Next.js 16 (App Router), React 19, TypeScript |
| Styling | Tailwind CSS 4, shadcn/ui |
| Backend/Auth | Supabase (PostgreSQL, Auth, RLS, Edge Functions) |
| Content | MDX via next-mdx-remote with custom components |
| AI Feedback | Anthropic Claude API — drafts corrections on student writing |
| Scheduling | Google Workspace Appointment Schedules |
| i18n | next-intl — English + Turkish |

### Key Technical Decisions

**Shared Supabase, separate codebases.** Both sites point at the same Supabase project. LMS tables coexist with portfolio tables, isolated by RLS. This avoids managing two databases while keeping the student-facing product completely independent from the portfolio site.

**MDX with custom components.** Lessons are authored as MDX files with embedded interactive components — `<VocabularyCard />` for flashcard-style vocabulary, `<GrammarCallout />` for collapsible "Stealth Grammar" explanations, and `<SubmissionForm />` for inline writing and audio recording. This gives instructional designers full control over the learning experience without touching React code.

**AI-assisted feedback pipeline.** When a student submits writing, the admin clicks "Draft Feedback" to generate a first-pass correction via Claude. The AI prompt includes the student's CEFR level and applies the "80% Threshold" for beginners (only correct errors that block meaning). The admin edits and approves before the student sees it — saving approximately 60% of review time.

**Module unlock gating.** The entire system revolves around "Tickets to Class" — writing or voice-note submissions that students must complete before booking a live session. A database trigger automatically unlocks the next module when all submissions in the current module are reviewed. This creates a natural study cadence without manual intervention.

**Track-conditional UI.** The dashboard renders differently based on the student's learning track. Executive students see a minimalist "Briefing Room" with business-framed objectives. Exam students see progress bars, score predictions, and module completion percentages. Same codebase, different experience.

## The Curriculum

Content follows a CEFR-Task Hybrid Model. CEFR provides the leveling system (A1 through C2). Task-Based Learning provides the framing — every module is titled by a professional function, not a grammar point.

The launch curriculum includes 5 Executive Survival A1 modules:

1. **The Professional Introduction** — 30-second elevator pitch
2. **Polite Requests & Professional Needs** — Can/Could/Would you mind
3. **Managing Global Time Zones** — Scheduling across time zones
4. **Communication Survival Kit** — Handling breakdowns in meetings
5. **The 30-Second Company Pitch** — Describing your company

Grammar is taught as "Stealth Grammar" — embedded in professional phrases, never presented as explicit rules. The goal is to sprint to B1 functional independence as fast as possible.

## What I Built

- Full authentication system with Supabase Auth (email/password, protected routes, middleware)
- 7-table database schema with row-level security and admin role system
- MDX content pipeline with 5 custom interactive components
- Dashboard shell with shadcn/ui sidebar and track-conditional navigation
- Student submission engine (text + browser audio recorder)
- Google Appointment Schedule integration with submission-gated booking
- Admin Command Center with student CRM, submission inbox, and session logger
- AI-drafted feedback via Claude API with CEFR-aware prompting
- Module unlock trigger (PostgreSQL function) for automatic progression
- Full i18n support (English + Turkish) via next-intl
