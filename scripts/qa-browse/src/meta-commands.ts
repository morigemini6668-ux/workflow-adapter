/**
 * Meta commands — tabs, server control, screenshots, chain, diff, snapshot
 */

import type { BrowserManager } from './browser-manager';
import { handleSnapshot } from './snapshot';
import { getCleanText } from './read-commands';
import { READ_COMMANDS, WRITE_COMMANDS, META_COMMANDS } from './commands';
import { validateNavigationUrl } from './url-validation';
import * as Diff from 'diff';
import * as path from 'path';

const SAFE_DIRECTORIES = ['/tmp', process.cwd()];

function validateOutputPath(filePath: string): void {
  const resolved = path.resolve(filePath);
  const isSafe = SAFE_DIRECTORIES.some(dir => resolved === dir || resolved.startsWith(dir + '/'));
  if (!isSafe) throw new Error(`Path must be within: ${SAFE_DIRECTORIES.join(', ')}`);
}

export async function handleMetaCommand(
  command: string,
  args: string[],
  bm: BrowserManager,
  shutdown: () => Promise<void> | void
): Promise<string> {
  switch (command) {
    case 'tabs': {
      const tabs = await bm.getTabListWithTitles();
      return tabs.map(t => `${t.active ? '→ ' : '  '}[${t.id}] ${t.title || '(untitled)'} — ${t.url}`).join('\n');
    }

    case 'tab': {
      const id = parseInt(args[0], 10);
      if (isNaN(id)) throw new Error('Usage: qa-browse tab <id>');
      bm.switchTab(id);
      return `Switched to tab ${id}`;
    }

    case 'newtab': {
      const url = args[0];
      const id = await bm.newTab(url);
      return `Opened tab ${id}${url ? ` → ${url}` : ''}`;
    }

    case 'closetab': {
      const id = args[0] ? parseInt(args[0], 10) : undefined;
      await bm.closeTab(id);
      return `Closed tab${id ? ` ${id}` : ''}`;
    }

    case 'status': {
      const page = bm.getPage();
      return [
        `Status: healthy`,
        `URL: ${page.url()}`,
        `Tabs: ${bm.getTabCount()}`,
        `PID: ${process.pid}`,
      ].join('\n');
    }

    case 'url':
      return bm.getCurrentUrl();

    case 'stop': {
      await shutdown();
      return 'Server stopped';
    }

    case 'restart': {
      console.log('[qa-browse] Restart requested.');
      await shutdown();
      return 'Restarting...';
    }

    case 'screenshot': {
      const page = bm.getPage();
      let outputPath = '/tmp/qa-browse-screenshot.png';
      let clipRect: { x: number; y: number; width: number; height: number } | undefined;
      let targetSelector: string | undefined;
      let viewportOnly = false;

      const remaining: string[] = [];
      for (let i = 0; i < args.length; i++) {
        if (args[i] === '--viewport') viewportOnly = true;
        else if (args[i] === '--clip') {
          const coords = args[++i];
          if (!coords) throw new Error('Usage: screenshot --clip x,y,w,h');
          const parts = coords.split(',').map(Number);
          if (parts.length !== 4 || parts.some(isNaN)) throw new Error('Usage: screenshot --clip x,y,width,height');
          clipRect = { x: parts[0], y: parts[1], width: parts[2], height: parts[3] };
        } else if (args[i].startsWith('--')) {
          throw new Error(`Unknown screenshot flag: ${args[i]}`);
        } else {
          remaining.push(args[i]);
        }
      }

      for (const arg of remaining) {
        if (arg.startsWith('@e') || arg.startsWith('@c') || arg.startsWith('.') || arg.startsWith('#') || arg.includes('[')) {
          targetSelector = arg;
        } else {
          outputPath = arg;
        }
      }

      validateOutputPath(outputPath);

      if (clipRect && targetSelector) throw new Error('Cannot use --clip with a selector');
      if (viewportOnly && clipRect) throw new Error('Cannot use --viewport with --clip');

      if (targetSelector) {
        const resolved = await bm.resolveRef(targetSelector);
        const locator = 'locator' in resolved ? resolved.locator : page.locator(resolved.selector);
        await locator.screenshot({ path: outputPath, timeout: 5000 });
        return `Screenshot saved (element): ${outputPath}`;
      }

      if (clipRect) {
        await page.screenshot({ path: outputPath, clip: clipRect });
        return `Screenshot saved (clip): ${outputPath}`;
      }

      await page.screenshot({ path: outputPath, fullPage: !viewportOnly });
      return `Screenshot saved${viewportOnly ? ' (viewport)' : ''}: ${outputPath}`;
    }

    case 'pdf': {
      const pdfPath = args[0] || '/tmp/qa-browse-page.pdf';
      validateOutputPath(pdfPath);
      await bm.getPage().pdf({ path: pdfPath, format: 'A4' });
      return `PDF saved: ${pdfPath}`;
    }

    case 'responsive': {
      const page = bm.getPage();
      const prefix = args[0] || '/tmp/qa-browse-responsive';
      validateOutputPath(prefix);
      const viewports = [
        { name: 'mobile', width: 375, height: 812 },
        { name: 'tablet', width: 768, height: 1024 },
        { name: 'desktop', width: 1280, height: 720 },
      ];
      const originalViewport = page.viewportSize();
      const results: string[] = [];

      for (const vp of viewports) {
        await page.setViewportSize({ width: vp.width, height: vp.height });
        const p = `${prefix}-${vp.name}.png`;
        await page.screenshot({ path: p, fullPage: true });
        results.push(`${vp.name} (${vp.width}x${vp.height}): ${p}`);
      }

      if (originalViewport) await page.setViewportSize(originalViewport);
      return results.join('\n');
    }

    case 'chain': {
      const jsonStr = args[0];
      if (!jsonStr) throw new Error('Usage: echo \'[["goto","url"],["text"]]\' | qa-browse chain');
      let commands: string[][];
      try { commands = JSON.parse(jsonStr); } catch { throw new Error('Invalid JSON'); }
      if (!Array.isArray(commands)) throw new Error('Expected JSON array');

      const { handleReadCommand } = await import('./read-commands');
      const { handleWriteCommand } = await import('./write-commands');
      const results: string[] = [];

      for (const cmd of commands) {
        const [name, ...cmdArgs] = cmd;
        try {
          let result: string;
          if (WRITE_COMMANDS.has(name)) result = await handleWriteCommand(name, cmdArgs, bm);
          else if (READ_COMMANDS.has(name)) result = await handleReadCommand(name, cmdArgs, bm);
          else if (META_COMMANDS.has(name)) result = await handleMetaCommand(name, cmdArgs, bm, shutdown);
          else throw new Error(`Unknown command: ${name}`);
          results.push(`[${name}] ${result}`);
        } catch (err: any) {
          results.push(`[${name}] ERROR: ${err.message}`);
        }
      }
      return results.join('\n\n');
    }

    case 'diff': {
      const [url1, url2] = args;
      if (!url1 || !url2) throw new Error('Usage: qa-browse diff <url1> <url2>');
      const page = bm.getPage();
      validateNavigationUrl(url1);
      await page.goto(url1, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const text1 = await getCleanText(page);
      validateNavigationUrl(url2);
      await page.goto(url2, { waitUntil: 'domcontentloaded', timeout: 15000 });
      const text2 = await getCleanText(page);
      const changes = Diff.diffLines(text1, text2);
      const output: string[] = [`--- ${url1}`, `+++ ${url2}`, ''];
      for (const part of changes) {
        const prefix = part.added ? '+' : part.removed ? '-' : ' ';
        for (const line of part.value.split('\n').filter(l => l.length > 0)) {
          output.push(`${prefix} ${line}`);
        }
      }
      return output.join('\n');
    }

    case 'snapshot':
      return await handleSnapshot(args, bm);

    default:
      throw new Error(`Unknown meta command: ${command}`);
  }
}
