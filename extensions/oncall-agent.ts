import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * On-Call Agent — Phase 1 skeleton.
 *
 * Proves the package loads and can (a) inject a system prompt and
 * (b) register a slash command. The 8-step workflow state machine,
 * confidence scoring, and human-in-the-loop checkpoints land in Phase 2+.
 */

const PHASE_1_MARKER = [
  "",
  "## On-Call Agent (prime-oncall-agent)",
  "Workflow engine lands in Phase 2. For now this only proves the package loads.",
  "",
].join("\n");

export default function oncallAgent(pi: ExtensionAPI) {
  pi.on("before_agent_start", async (event) => {
    return { systemPrompt: PHASE_1_MARKER + "\n" + event.systemPrompt };
  });

  pi.registerCommand("oncall", {
    description: "Show on-call agent status",
    handler: async (_args, ctx) => {
      ctx.ui.notify(
        "prime-oncall-agent loaded. Workflow engine (8-step state machine) lands in Phase 2.",
        "info",
      );
    },
  });
}
