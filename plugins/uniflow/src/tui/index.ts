import { createElement } from 'react';
import { render } from 'ink';
import { App, type TuiDataSource } from './App.js';
import {
  listAgents,
  listTasks,
  readEvents,
  findActiveSession,
  type SessionContext,
} from '../daemon/state.js';
import type { AgentState, Task, Event } from '../lib/types.js';

/**
 * File-based data source: reads state directly from ~/.uniflow session files.
 * Works even when daemon socket is unavailable.
 */
function createFileDataSource(project: string, sessionId: string): TuiDataSource {
  const ctx: SessionContext = { project, sessionId };

  return {
    async fetchAgents(): Promise<AgentState[]> {
      return listAgents(ctx);
    },
    async fetchTasks(): Promise<Task[]> {
      return listTasks(ctx);
    },
    async fetchEvents(): Promise<Event[]> {
      return readEvents(ctx);
    },
    getSessionName(): string | undefined {
      return project;
    },
  };
}

/**
 * Launch the TUI by finding active session and rendering Ink app.
 */
export async function launchTui(projectName?: string): Promise<void> {
  // Discover project name from .uniflow-id if not provided
  let project = projectName;
  if (!project) {
    const { readFile } = await import('node:fs/promises');
    const { UNIFLOW_ID_FILE } = await import('../lib/constants.js');
    const { join } = await import('node:path');
    try {
      project = (await readFile(join(process.cwd(), UNIFLOW_ID_FILE), 'utf-8')).trim();
    } catch {
      throw new Error('No .uniflow-id found. Run "uniflow init" first.');
    }
  }

  // Find active session
  const session = await findActiveSession(project);
  if (!session) {
    throw new Error(`No active session found for project "${project}". Run "uniflow start" first.`);
  }

  // Check stdin supports raw mode (required by Ink for keyboard input)
  if (!process.stdin.isTTY) {
    throw new Error('TUI requires a TTY. Run in a terminal or tmux pane.');
  }

  const dataSource = createFileDataSource(project, session.id);

  const { waitUntilExit } = render(
    createElement(App, { dataSource }),
  );

  await waitUntilExit();
}
