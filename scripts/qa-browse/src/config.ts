/**
 * Config for qa-browse CLI + server.
 *
 * State directory: .workflow-adapter/qa-browse/ (project-local)
 */

import * as fs from 'fs';
import * as path from 'path';

export interface BrowseConfig {
  projectDir: string;
  stateDir: string;
  stateFile: string;
  consoleLog: string;
  networkLog: string;
  dialogLog: string;
}

export function getGitRoot(): string | null {
  try {
    const proc = Bun.spawnSync(['git', 'rev-parse', '--show-toplevel'], {
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 2_000,
    });
    if (proc.exitCode !== 0) return null;
    return proc.stdout.toString().trim() || null;
  } catch {
    return null;
  }
}

export function resolveConfig(
  env: Record<string, string | undefined> = process.env,
): BrowseConfig {
  let stateFile: string;
  let stateDir: string;
  let projectDir: string;

  if (env.QA_BROWSE_STATE_FILE) {
    stateFile = env.QA_BROWSE_STATE_FILE;
    stateDir = path.dirname(stateFile);
    projectDir = path.dirname(path.dirname(stateDir)); // parent of .workflow-adapter/qa-browse/
  } else {
    projectDir = getGitRoot() || process.cwd();
    stateDir = path.join(projectDir, '.workflow-adapter', 'qa-browse');
    stateFile = path.join(stateDir, 'server.json');
  }

  return {
    projectDir,
    stateDir,
    stateFile,
    consoleLog: path.join(stateDir, 'console.log'),
    networkLog: path.join(stateDir, 'network.log'),
    dialogLog: path.join(stateDir, 'dialog.log'),
  };
}

export function ensureStateDir(config: BrowseConfig): void {
  try {
    fs.mkdirSync(config.stateDir, { recursive: true });
  } catch (err: any) {
    if (err.code === 'EACCES') {
      throw new Error(`Cannot create state directory ${config.stateDir}: permission denied`);
    }
    throw err;
  }
}
