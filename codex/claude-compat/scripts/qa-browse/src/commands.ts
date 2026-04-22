/**
 * Command registry — single source of truth for all qa-browse commands.
 */

export const READ_COMMANDS = new Set([
  'text', 'html', 'links', 'forms', 'accessibility',
  'js', 'eval', 'css', 'attrs',
  'console', 'network', 'cookies', 'storage', 'perf',
  'dialog', 'is',
]);

export const WRITE_COMMANDS = new Set([
  'goto', 'back', 'forward', 'reload',
  'click', 'fill', 'select', 'hover', 'type', 'press', 'scroll', 'wait',
  'viewport', 'maximize', 'cookie', 'cookie-import', 'header', 'useragent',
  'upload', 'dialog-accept', 'dialog-dismiss',
]);

export const META_COMMANDS = new Set([
  'tabs', 'tab', 'newtab', 'closetab',
  'status', 'stop', 'restart',
  'screenshot', 'pdf', 'responsive',
  'chain', 'diff',
  'url', 'snapshot',
  'handoff', 'resume',
]);

export const ALL_COMMANDS = new Set([...READ_COMMANDS, ...WRITE_COMMANDS, ...META_COMMANDS]);

export const COMMAND_DESCRIPTIONS: Record<string, { category: string; description: string; usage?: string }> = {
  'goto':    { category: 'Navigation', description: 'Navigate to URL', usage: 'goto <url>' },
  'back':    { category: 'Navigation', description: 'History back' },
  'forward': { category: 'Navigation', description: 'History forward' },
  'reload':  { category: 'Navigation', description: 'Reload page' },
  'url':     { category: 'Navigation', description: 'Print current URL' },
  'text':    { category: 'Reading', description: 'Cleaned page text' },
  'html':    { category: 'Reading', description: 'innerHTML of selector or full page HTML', usage: 'html [selector]' },
  'links':   { category: 'Reading', description: 'All links as "text -> href"' },
  'forms':   { category: 'Reading', description: 'Form fields as JSON' },
  'accessibility': { category: 'Reading', description: 'Full ARIA tree' },
  'js':      { category: 'Inspection', description: 'Run JavaScript expression', usage: 'js <expr>' },
  'eval':    { category: 'Inspection', description: 'Run JavaScript from file', usage: 'eval <file>' },
  'css':     { category: 'Inspection', description: 'Computed CSS value', usage: 'css <sel> <prop>' },
  'attrs':   { category: 'Inspection', description: 'Element attributes as JSON', usage: 'attrs <sel|@ref>' },
  'is':      { category: 'Inspection', description: 'State check (visible/hidden/enabled/disabled/checked/editable/focused)', usage: 'is <prop> <sel>' },
  'console': { category: 'Inspection', description: 'Console messages (--errors filters to error/warning)', usage: 'console [--clear|--errors]' },
  'network': { category: 'Inspection', description: 'Network requests', usage: 'network [--clear]' },
  'dialog':  { category: 'Inspection', description: 'Dialog messages', usage: 'dialog [--clear]' },
  'cookies': { category: 'Inspection', description: 'All cookies as JSON' },
  'storage': { category: 'Inspection', description: 'localStorage + sessionStorage, or set key', usage: 'storage [set k v]' },
  'perf':    { category: 'Inspection', description: 'Page load timings' },
  'click':   { category: 'Interaction', description: 'Click element', usage: 'click <sel>' },
  'fill':    { category: 'Interaction', description: 'Fill input', usage: 'fill <sel> <val>' },
  'select':  { category: 'Interaction', description: 'Select dropdown option', usage: 'select <sel> <val>' },
  'hover':   { category: 'Interaction', description: 'Hover element', usage: 'hover <sel>' },
  'type':    { category: 'Interaction', description: 'Type into focused element', usage: 'type <text>' },
  'press':   { category: 'Interaction', description: 'Press key (Enter, Tab, Escape, etc.)', usage: 'press <key>' },
  'scroll':  { category: 'Interaction', description: 'Scroll element into view or to bottom', usage: 'scroll [sel]' },
  'wait':    { category: 'Interaction', description: 'Wait for element or network state', usage: 'wait <sel|--networkidle|--load>' },
  'upload':  { category: 'Interaction', description: 'Upload file(s)', usage: 'upload <sel> <file> [file2...]' },
  'viewport':{ category: 'Interaction', description: 'Set viewport size', usage: 'viewport <WxH>' },
  'maximize':{ category: 'Interaction', description: 'Maximize viewport to screen resolution' },
  'cookie':  { category: 'Interaction', description: 'Set cookie on current domain', usage: 'cookie <name>=<value>' },
  'cookie-import': { category: 'Interaction', description: 'Import cookies from JSON file', usage: 'cookie-import <json>' },
  'header':  { category: 'Interaction', description: 'Set custom request header', usage: 'header <name>:<value>' },
  'useragent': { category: 'Interaction', description: 'Set user agent', usage: 'useragent <string>' },
  'dialog-accept': { category: 'Interaction', description: 'Auto-accept next dialog', usage: 'dialog-accept [text]' },
  'dialog-dismiss': { category: 'Interaction', description: 'Auto-dismiss next dialog' },
  'screenshot': { category: 'Visual', description: 'Save screenshot', usage: 'screenshot [--viewport] [--clip x,y,w,h] [selector|@ref] [path]' },
  'pdf':     { category: 'Visual', description: 'Save as PDF', usage: 'pdf [path]' },
  'responsive': { category: 'Visual', description: 'Screenshots at mobile/tablet/desktop', usage: 'responsive [prefix]' },
  'diff':    { category: 'Visual', description: 'Text diff between pages', usage: 'diff <url1> <url2>' },
  'tabs':    { category: 'Tabs', description: 'List open tabs' },
  'tab':     { category: 'Tabs', description: 'Switch to tab', usage: 'tab <id>' },
  'newtab':  { category: 'Tabs', description: 'Open new tab', usage: 'newtab [url]' },
  'closetab':{ category: 'Tabs', description: 'Close tab', usage: 'closetab [id]' },
  'status':  { category: 'Server', description: 'Health check' },
  'stop':    { category: 'Server', description: 'Shutdown server' },
  'restart': { category: 'Server', description: 'Restart server' },
  'snapshot':{ category: 'Snapshot', description: 'Accessibility tree with @e refs', usage: 'snapshot [flags]' },
  'chain':   { category: 'Meta', description: 'Run commands from JSON stdin' },
  'handoff': { category: 'Server', description: 'Open visible Chrome for user takeover (2FA, CAPTCHA)', usage: 'handoff [message]' },
  'resume':  { category: 'Server', description: 'Re-snapshot after user takeover, return control to AI' },
};
