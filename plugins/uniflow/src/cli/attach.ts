import { tmuxSessionName } from "../lib/constants.js";
import { findProjectRoot, readProjectName } from "./init.js";

export default async function attach(_args: string[]): Promise<void> {
  const root = await findProjectRoot();
  if (!root) {
    console.error('Not in a uniflow project. Run "uniflow init" first.');
    process.exit(1);
  }

  const project = await readProjectName(root);
  const sessionName = tmuxSessionName(project);

  // Exec into tmux attach-session (replaces this process)
  const proc = Bun.spawn(["tmux", "attach-session", "-t", sessionName], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  process.exit(exitCode);
}
