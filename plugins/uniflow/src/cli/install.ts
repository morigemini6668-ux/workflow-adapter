import { existsSync } from 'node:fs';
import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

const UNIFLOW_BIN = process.argv[1] ?? 'uniflow';

async function installClaudePlugin(): Promise<boolean> {
  const claudeDir = join(homedir(), '.claude');
  if (!existsSync(claudeDir)) {
    console.log('  \u2717 Claude Code config dir not found (~/.claude/)');
    return false;
  }

  const pluginDir = join(claudeDir, 'plugins', 'uniflow');
  const pluginJsonDir = join(pluginDir, '.claude-plugin');
  const binDir = join(pluginDir, 'bin');

  await mkdir(pluginJsonDir, { recursive: true });
  await mkdir(binDir, { recursive: true });

  // plugin.json
  await writeFile(
    join(pluginJsonDir, 'plugin.json'),
    JSON.stringify({
      name: 'uniflow',
      description: 'tmux-native multi-agent orchestration',
      version: '0.1.0',
    }, null, 2) + '\n',
    'utf-8',
  );

  // bin/uniflow symlink or wrapper
  const binPath = join(binDir, 'uniflow');
  const resolvedBin = dirname(UNIFLOW_BIN);
  await writeFile(
    binPath,
    `#!/usr/bin/env bash\nexec bun run "${join(resolvedBin, 'index.ts')}" "$@"\n`,
    { mode: 0o755 },
  );

  console.log(`  \u2713 Claude Code plugin installed: ${pluginDir}`);
  console.log(`  \u2713 uniflow CLI available in Claude Code sessions`);
  return true;
}

async function installCodexSkill(): Promise<boolean> {
  const codexSkillDir = join(homedir(), '.agents', 'skills', 'uniflow');

  await mkdir(codexSkillDir, { recursive: true });

  await writeFile(
    join(codexSkillDir, 'SKILL.md'),
    [
      '---',
      'name: uniflow',
      'description: tmux-native multi-agent orchestration via uniflow CLI',
      '---',
      '',
      '# uniflow',
      '',
      'Use the `uniflow` CLI to orchestrate multi-agent workflows.',
      '',
      '## Available Commands',
      '',
      '- `uniflow status` — check session status',
      '- `uniflow spawn <name>` — spawn a worker agent',
      '- `uniflow send <agent> <message>` — send message to agent',
      '- `uniflow task-add <subject>` — create a new task',
      '- `uniflow assign <task-id> <agent>` — assign task to agent',
      '- `uniflow --help` — show all commands',
      '',
    ].join('\n'),
    'utf-8',
  );

  // Append to AGENTS.md if exists
  const agentsPath = join(homedir(), '.codex', 'AGENTS.md');
  if (existsSync(agentsPath)) {
    const content = await readFile(agentsPath, 'utf-8');
    if (!content.includes('uniflow')) {
      await appendFile(
        agentsPath,
        '\n## uniflow Integration\n\n- Use `uniflow` CLI to orchestrate multi-agent workflows via tmux\n- Run `uniflow --help` for available commands\n',
        'utf-8',
      );
      console.log(`  \u2713 AGENTS.md updated with uniflow section`);
    }
  }

  console.log(`  \u2713 Codex skill installed: ${codexSkillDir}`);
  return true;
}

export default async function install(_args: string[]): Promise<void> {
  console.log('Installing uniflow integrations...\n');

  console.log('Claude Code:');
  const claudeOk = await installClaudePlugin();
  if (!claudeOk) {
    console.log('  (skipped — Claude Code not detected)\n');
  } else {
    console.log();
  }

  console.log('Codex CLI:');
  const codexOk = await installCodexSkill();
  if (!codexOk) {
    console.log('  (skipped)\n');
  } else {
    console.log();
  }

  console.log('Done. Run "uniflow doctor" to verify.');
}
