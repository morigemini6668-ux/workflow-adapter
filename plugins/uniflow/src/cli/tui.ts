import { launchTui } from "../tui/index.js";

export default async function tui(_args: string[]): Promise<void> {
  await launchTui();
}
