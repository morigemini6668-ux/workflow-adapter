---
name: session-insights
description: |
  Analyze Claude Code session data to find improvement opportunities for workflow-adapter.
  Use this skill when the user mentions "세션 분석", "session insights", "세션 인사이트",
  "사용 패턴", "usage patterns", "friction analysis", "개선점 분석", "plugin diagnostics",
  "session analysis", "사용 분석", "tool usage", "세션 데이터 분석", "플러그인 진단",
  or asks about improving the plugin based on usage data.
argument-hint: "[--project <path>] [--yes]"
allowed-tools:
  - Bash
  - Read
  - Write
  - Glob
  - Grep
  - AskUserQuestion
---

# Session Insights — Usage-Based Plugin Diagnostics

Analyze pre-computed Claude Code session data (facets, session-meta, history.jsonl) to produce a structured diagnostic report with friction hotspots, principle candidates, skill usage gaps, and recommended actions.

> **Relationship to `/retrospective`**: This skill is complementary to `/retrospective`. While `/retrospective` analyzes a single completed workflow session's artifacts (brainstorming.md, plan.md, git changes) to extract principles, **`/session-insights`** analyzes aggregated machine-wide session telemetry data (friction counts, tool errors, usage patterns) across all sessions. Use both together for comprehensive plugin improvement.

## Step 0: Parse Options

Check the user's arguments for these flags:

- `--project <path>`: If present, filter analysis to sessions from this project path only. Remove from remaining arguments.
- `--yes`: If present, set `auto_confirm = true` (skip user confirmation of results). Remove from remaining arguments.

Defaults:
- `project_filter = null` (analyze all projects)
- `auto_confirm = false`

## Step 1: Principle Compliance

Before starting any work:
1. Check if `.workflow-adapter/principle.md` exists. If it does, read it and follow all its directives.

## Step 2: Data Collection

### 2a. Create Output Directory

```bash
mkdir -p .workflow-adapter/session-insights
```

### 2b. Run Aggregation Script

Run the data aggregation script to collect and summarize session data:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/scripts/lib/aggregate-session-data.ts \
  --output .workflow-adapter/session-insights/analysis-summary.json \
  ${project_filter:+--project "$project_filter"}
```

- If the script exits with a non-zero code or produces no output, inform the user:
  ```
  No session data found. Please run `/insights` in a few Claude Code sessions first
  to generate usage data, then retry `/session-insights`.
  ```
  **Stop here** — do not proceed to analysis.

### 2c. Staleness Check

Read `.workflow-adapter/session-insights/analysis-summary.json` and check the `metadata.staleness_days` field:

- If `staleness_days > 7`: Warn the user:
  ```
  ⚠ Session data is {N} days old. Results may not reflect recent usage.
  Consider running `/insights` in a few sessions to refresh the data, then re-run this analysis.
  ```
  Ask whether to continue or stop (unless `auto_confirm = true`, in which case continue with the warning noted).

- If `staleness_days <= 7`: Proceed without warning.

## Step 3: Analysis & Report

Read the `analysis-summary.json` file and produce a structured markdown report.

### 3a. Compute Derived Metrics

From the aggregated data, compute:

- **Success rate**: `outcomes.fully_achieved / metadata.total_sessions * 100`
- **Friction rate**: sessions with any friction count > 0 / total sessions * 100
- **Top tool**: highest count in `tools` section
- **Error rate**: total tool errors / total tool invocations * 100

### 3b. Generate Report

Save the report to: `.workflow-adapter/session-insights/report-{YYYY-MM-DD}.md`

The report must contain exactly these 5 sections:

---

#### a. Dashboard

A key metrics summary table:

```markdown
## Dashboard

| Metric | Value |
|--------|-------|
| Total Sessions | {metadata.total_sessions} |
| Coverage | {metadata.coverage_pct}% |
| Data Freshness | {metadata.staleness_days} days old |
| Success Rate | {computed}% (fully_achieved / total) |
| Friction Rate | {computed}% (sessions with friction / total) |
| Top Tool | {tool name} ({count} invocations) |
| Total Tokens | {tokens.input + tokens.output} |
| Median Duration | {duration.median} |
```

If `--project` was specified, add a row: `| Project Filter | {path} |`

---

#### b. Friction Hotspots

Rank friction categories by total count (descending). For each category (top 10 max):

```markdown
## Friction Hotspots

### 1. {category_name} — {count} occurrences

**Representative examples:**
- {friction_detail_1}
- {friction_detail_2}
- {friction_detail_3}

**Suggested mitigation:** {specific, actionable suggestion — e.g., add a principle rule, improve a skill description, adjust a hook}
```

Also include a summary of `tool_errors` if any exist:

```markdown
### Tool Error Summary

| Error Category | Count |
|---------------|-------|
| {category} | {count} |
```

---

#### c. Principle Candidates

Identify recurring friction patterns (3+ instances) that could be codified as principle.md rules. For each candidate:

```markdown
## Principle Candidates

### Candidate 1: {proposed rule title}

- **Proposed rule**: "{clear, actionable statement suitable for principle.md}"
- **Evidence**: {which friction categories/details support this — cite counts}
- **Confidence**: {HIGH if 10+ occurrences, MEDIUM if 5-9, LOW if 3-4}
- **Scope**: {global / agent-specific — suggest which agent if applicable}
```

If no patterns meet the 3-instance threshold, state: "No friction patterns met the minimum threshold (3+ occurrences) for principle candidates."

---

#### d. Skill Usage Gaps

Cross-reference registered skills with actual slash command usage from `skills` data:

```markdown
## Skill Usage Gaps

### Never-Used Skills
Skills registered in the plugin but with zero invocations in the analyzed period:
- `{skill_name}` — registered description: "{description}"

### Underused Skills
Skills with significantly fewer invocations than the average:
- `{skill_name}` — {count} invocations (average: {avg})
  - **Possible cause**: trigger description may not match common user phrasing
  - **Suggested trigger additions**: "{suggested_phrase_1}", "{suggested_phrase_2}"

### Most-Used Skills
For context, the most frequently invoked skills:
- `{skill_name}` — {count} invocations
```

To enumerate registered skills:
1. Use Glob to list all `${CLAUDE_PLUGIN_ROOT}/skills/*/SKILL.md` files
2. Extract skill names from directory names
3. Compare against invocation counts in the `skills` section of analysis-summary.json

---

#### e. Recommended Actions

Prioritized list of specific improvements, each linked to evidence:

```markdown
## Recommended Actions

### HIGH Priority

1. **{action title}**
   - Evidence: {link to Friction Hotspots or Skill Usage Gaps section with specific counts}
   - Suggested approach: {e.g., "Run `/retrospective` to add this as a principle", "Edit SKILL.md trigger description", "Add a PreToolUse hook"}
   - Expected impact: {what improvement this would bring}

### MEDIUM Priority

2. **{action title}**
   ...

### LOW Priority

3. **{action title}**
   ...
```

Priority thresholds:
- **HIGH**: friction count > 10 OR tool error count > 50
- **MEDIUM**: friction count 3-10 OR tool error count 10-50
- **LOW**: friction count < 3 OR tool error count < 10 OR skill usage gap

---

### 3c. Add Report Metadata

Add a footer to the report:

```markdown
---
_Generated by `/session-insights` on {YYYY-MM-DD HH:MM}_
_Data source: ~/.claude/usage-data/ (facets, session-meta, history.jsonl)_
_Sessions analyzed: {total} | Project filter: {path or "none"}_
_This is a read-only diagnostic report. No plugin files were modified._
```

## Step 4: Present Results

### 4a. Show Summary

Display a brief summary to the user:

```
Session Insights Report Generated

Sessions analyzed: {total}
Success rate: {pct}%
Friction hotspots: {count} categories identified
Principle candidates: {count}
Skill usage gaps: {count} never-used, {count} underused
Recommended actions: {HIGH count} high, {MEDIUM count} medium, {LOW count} low priority

Full report: .workflow-adapter/session-insights/report-{YYYY-MM-DD}.md
```

### 4b. Top Recommendations (if auto_confirm = false)

If `auto_confirm` is false, present the top 5 recommended actions to the user via AskUserQuestion:

```
AskUserQuestion({
  questions: [{
    question: "Here are the top recommendations from session analysis:\n\n{numbered list of top 5 actions with brief evidence}\n\nWould you like to act on any of these?",
    header: "Session Insights",
    options: [
      { label: "Acknowledged", description: "I'll review the full report and decide later" },
      { label: "Run /retrospective", description: "Start a retrospective to address principle-related findings" },
      { label: "Show full report", description: "Display the complete report inline" }
    ],
    multiSelect: false
  }]
})
```

If the user selects "Show full report", read and display the report file.
If the user selects "Run /retrospective", suggest the command but do not invoke it automatically.

### 4c. Next Steps

Inform the user of suggested follow-up actions:

```
Suggested next steps:
- Review the full report: .workflow-adapter/session-insights/report-{YYYY-MM-DD}.md
- For principle updates: run `/retrospective` (analyzes workflow artifacts, complementary to this report)
- For skill trigger improvements: edit the relevant SKILL.md description field directly
- For hook-based mitigations: use `/workflow-adapter:hook-development` to create new hooks
```

## Important Rules

1. **NEVER modify any plugin files** — this skill is report-only. Do not edit SKILL.md files, commands, hooks, agents, or any source code.
2. **NEVER read raw JSONL session transcripts** — only read from `~/.claude/usage-data/facets/`, `~/.claude/usage-data/session-meta/`, and `~/.claude/history.jsonl` via the aggregation script. Never access raw session conversation data.
3. **NEVER modify its own SKILL.md or any other skill definition** — all improvement suggestions are advisory only, presented in the report for human action.
4. **Complementary to `/retrospective`** — always state in output that this analysis uses a different data source (machine-wide telemetry) than retrospective (single-session workflow artifacts). Both should be used together for comprehensive improvement.
5. **Evidence-based suggestions only** — every recommendation must cite specific friction counts, error counts, or usage statistics. No speculative suggestions without data backing.
