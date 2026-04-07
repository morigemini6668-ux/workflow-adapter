import { existsSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { parseArgs } from "util";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const USAGE_DATA_DIR = join(HOME, ".claude", "usage-data");
const FACETS_DIR = join(USAGE_DATA_DIR, "facets");
const SESSION_META_DIR = join(USAGE_DATA_DIR, "session-meta");
const HISTORY_FILE = join(HOME, ".claude", "history.jsonl");

interface Facet {
  session_id: string;
  outcome?: string;
  friction_counts?: Record<string, number>;
  friction_detail?: string;
  user_satisfaction_counts?: Record<string, number>;
  [key: string]: unknown;
}

interface SessionMeta {
  session_id: string;
  project_path?: string;
  start_time?: string;
  duration_minutes?: number;
  tool_counts?: Record<string, number>;
  tool_errors?: number;
  tool_error_categories?: Record<string, number>;
  input_tokens?: number;
  output_tokens?: number;
  [key: string]: unknown;
}

interface HistoryEntry {
  display?: string;
  timestamp?: number;
  project?: string;
}

async function readJsonFiles<T>(dir: string): Promise<T[]> {
  if (!existsSync(dir)) return [];
  const results: T[] = [];
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const data = await Bun.file(join(dir, name)).json();
      results.push(data as T);
    } catch {
      // skip malformed files
    }
  }
  return results;
}

async function readHistoryJsonl(): Promise<HistoryEntry[]> {
  if (!existsSync(HISTORY_FILE)) return [];
  try {
    const text = await Bun.file(HISTORY_FILE).text();
    const entries: HistoryEntry[] = [];
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        entries.push(JSON.parse(line));
      } catch {
        // skip malformed lines
      }
    }
    return entries;
  } catch {
    return [];
  }
}

function getNewestMtime(dir: string): number {
  if (!existsSync(dir)) return 0;
  let newest = 0;
  for (const name of readdirSync(dir)) {
    try {
      const st = statSync(join(dir, name));
      if (st.mtimeMs > newest) newest = st.mtimeMs;
    } catch {
      // skip
    }
  }
  return newest;
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function aggregate(projectFilter?: string) {
  const [facets, sessionMetas, history] = await Promise.all([
    readJsonFiles<Facet>(FACETS_DIR),
    readJsonFiles<SessionMeta>(SESSION_META_DIR),
    readHistoryJsonl(),
  ]);

  // Build session-meta lookup by session_id
  const metaById = new Map<string, SessionMeta>();
  for (const m of sessionMetas) {
    metaById.set(m.session_id, m);
  }

  // Determine which session IDs to include (project filter)
  let includedSessionIds: Set<string> | null = null;
  if (projectFilter) {
    includedSessionIds = new Set<string>();
    for (const m of sessionMetas) {
      if (m.project_path && m.project_path.startsWith(projectFilter)) {
        includedSessionIds.add(m.session_id);
      }
    }
  }

  // Filter facets and metas
  const filteredFacets = includedSessionIds
    ? facets.filter((f) => includedSessionIds!.has(f.session_id))
    : facets;

  const filteredMetas = includedSessionIds
    ? sessionMetas.filter((m) => includedSessionIds!.has(m.session_id))
    : sessionMetas;

  // Filter history entries
  const filteredHistory =
    projectFilter
      ? history.filter((h) => h.project && h.project.startsWith(projectFilter))
      : history;

  // --- metadata ---
  const facetSessionIds = new Set(filteredFacets.map((f) => f.session_id));
  const metaSessionIds = new Set(filteredMetas.map((m) => m.session_id));
  const totalSessions = metaSessionIds.size;
  const coveredSessions = facetSessionIds.size;
  const coveragePct =
    totalSessions > 0
      ? Math.round((coveredSessions / totalSessions) * 100)
      : 0;

  const startTimes = filteredMetas
    .map((m) => m.start_time)
    .filter(Boolean)
    .map((t) => new Date(t!).getTime())
    .filter((t) => !isNaN(t));

  const newestTimestamp = startTimes.length > 0 ? Math.max(...startTimes) : 0;
  const oldestTimestamp = startTimes.length > 0 ? Math.min(...startTimes) : 0;

  const newestMtimeFacets = getNewestMtime(FACETS_DIR);
  const newestMtimeMeta = getNewestMtime(SESSION_META_DIR);
  const newestMtime = Math.max(newestMtimeFacets, newestMtimeMeta);
  const stalenessDays =
    newestMtime > 0
      ? Math.round((Date.now() - newestMtime) / (1000 * 60 * 60 * 24))
      : -1;

  const metadata = {
    total_sessions: totalSessions,
    facet_sessions: coveredSessions,
    coverage_pct: coveragePct,
    newest_session: newestTimestamp > 0 ? new Date(newestTimestamp).toISOString() : null,
    oldest_session: oldestTimestamp > 0 ? new Date(oldestTimestamp).toISOString() : null,
    staleness_days: stalenessDays,
  };

  // --- outcomes ---
  const outcomes: Record<string, number> = {};
  for (const f of filteredFacets) {
    const o = f.outcome || "unknown";
    outcomes[o] = (outcomes[o] || 0) + 1;
  }

  // --- friction ---
  const frictionCounts: Record<string, number> = {};
  const frictionDetails: string[] = [];
  for (const f of filteredFacets) {
    if (f.friction_counts) {
      for (const [k, v] of Object.entries(f.friction_counts)) {
        frictionCounts[k] = (frictionCounts[k] || 0) + v;
      }
    }
    if (f.friction_detail && f.friction_detail.trim()) {
      frictionDetails.push(f.friction_detail.trim());
    }
  }

  // Group and dedupe friction details, keep top by frequency
  const detailFreq = new Map<string, number>();
  for (const d of frictionDetails) {
    detailFreq.set(d, (detailFreq.get(d) || 0) + 1);
  }
  const topFrictionDetails = [...detailFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([detail, count]) => ({ detail, count }));

  const friction = {
    counts: frictionCounts,
    top_details: topFrictionDetails,
    total_sessions_with_friction: filteredFacets.filter(
      (f) => f.friction_counts && Object.keys(f.friction_counts).length > 0
    ).length,
  };

  // --- tools ---
  const toolCounts: Record<string, number> = {};
  for (const m of filteredMetas) {
    if (m.tool_counts) {
      for (const [k, v] of Object.entries(m.tool_counts)) {
        toolCounts[k] = (toolCounts[k] || 0) + v;
      }
    }
  }
  const toolsSorted = Object.entries(toolCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tool, count]) => ({ tool, count }));

  // --- tool_errors ---
  const toolErrorCategories: Record<string, number> = {};
  let totalToolErrors = 0;
  for (const m of filteredMetas) {
    totalToolErrors += m.tool_errors || 0;
    if (m.tool_error_categories) {
      for (const [k, v] of Object.entries(m.tool_error_categories)) {
        toolErrorCategories[k] = (toolErrorCategories[k] || 0) + v;
      }
    }
  }
  const toolErrors = {
    total: totalToolErrors,
    categories: toolErrorCategories,
  };

  // --- projects ---
  const projectMap = new Map<
    string,
    { sessions: number; outcomes: string[]; frictionCount: number }
  >();
  for (const m of filteredMetas) {
    const p = m.project_path || "unknown";
    if (!projectMap.has(p)) {
      projectMap.set(p, { sessions: 0, outcomes: [], frictionCount: 0 });
    }
    const entry = projectMap.get(p)!;
    entry.sessions++;
    // Find matching facet
    const facet = filteredFacets.find((f) => f.session_id === m.session_id);
    if (facet) {
      entry.outcomes.push(facet.outcome || "unknown");
      if (
        facet.friction_counts &&
        Object.keys(facet.friction_counts).length > 0
      ) {
        entry.frictionCount++;
      }
    }
  }
  const projects = [...projectMap.entries()]
    .sort((a, b) => b[1].sessions - a[1].sessions)
    .slice(0, 30)
    .map(([path, data]) => {
      const successCount = data.outcomes.filter(
        (o) => o === "fully_achieved" || o === "mostly_achieved"
      ).length;
      const totalWithOutcome = data.outcomes.length;
      return {
        project_path: path,
        session_count: data.sessions,
        success_rate:
          totalWithOutcome > 0
            ? Math.round((successCount / totalWithOutcome) * 100)
            : 0,
        friction_rate:
          data.sessions > 0
            ? Math.round((data.frictionCount / data.sessions) * 100)
            : 0,
      };
    });

  // --- skills (slash commands from history) ---
  const skillCounts: Record<string, number> = {};
  for (const h of filteredHistory) {
    const display = h.display?.trim();
    if (display && display.startsWith("/")) {
      // Extract just the command name (first word after /)
      const match = display.match(/^(\/[\w:-]+)/);
      if (match) {
        const cmd = match[1];
        skillCounts[cmd] = (skillCounts[cmd] || 0) + 1;
      }
    }
  }
  const skills = Object.entries(skillCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([command, count]) => ({ command, count }));

  // --- satisfaction ---
  const satisfaction: Record<string, number> = {};
  for (const f of filteredFacets) {
    if (f.user_satisfaction_counts) {
      for (const [k, v] of Object.entries(f.user_satisfaction_counts)) {
        satisfaction[k] = (satisfaction[k] || 0) + v;
      }
    }
  }

  // --- duration ---
  const durations = filteredMetas
    .map((m) => m.duration_minutes)
    .filter((d): d is number => typeof d === "number" && d > 0);

  const duration = {
    median_minutes: Math.round(median(durations) * 10) / 10,
    mean_minutes:
      durations.length > 0
        ? Math.round(
            (durations.reduce((a, b) => a + b, 0) / durations.length) * 10
          ) / 10
        : 0,
    p90_minutes: Math.round(percentile(durations, 90) * 10) / 10,
    total_sessions_with_duration: durations.length,
  };

  // --- tokens ---
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const m of filteredMetas) {
    totalInputTokens += m.input_tokens || 0;
    totalOutputTokens += m.output_tokens || 0;
  }
  const tokens = {
    total_input: totalInputTokens,
    total_output: totalOutputTokens,
    total: totalInputTokens + totalOutputTokens,
  };

  return {
    metadata,
    outcomes,
    friction,
    tools: toolsSorted,
    tool_errors: toolErrors,
    projects,
    skills,
    satisfaction,
    duration,
    tokens,
  };
}

// --- CLI ---
const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    project: { type: "string" },
    output: { type: "string" },
  },
  strict: false,
});

const result = await aggregate(values.project as string | undefined);
const json = JSON.stringify(result, null, 2);

if (values.output) {
  await Bun.write(values.output as string, json);
  console.error(`Written to ${values.output}`);
} else {
  console.log(json);
}
