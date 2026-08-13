import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const STEPS = [
  { id: 1, name: "understand", label: "Understand the bug" },
  { id: 2, name: "explore", label: "Explore codebase" },
  { id: 3, name: "confidence", label: "Reach 95% confidence" },
  { id: 4, name: "reproduce", label: "Reproduce — failing test" },
  { id: 5, name: "propose", label: "Propose the fix" },
  { id: 6, name: "implement", label: "Implement + tests" },
  { id: 7, name: "self-review", label: "Self-review" },
  { id: 8, name: "release", label: "Release plan" },
];

interface OncallState {
  currentStep: number;
  awaitingApproval: boolean;
  rootCauseConfidence: number;
  finished: boolean;
  steered: boolean;
  history: Array<{ step: number; summary: string; at: number }>;
}

function freshState(): OncallState {
  return {
    currentStep: 1,
    awaitingApproval: false,
    rootCauseConfidence: 0,
    finished: false,
    steered: false,
    history: [],
  };
}

function clampConfidence(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

let state: OncallState = freshState();
let sessionId = "unknown";
let sessionName = "";

// ─── Dashboard mirror ───
// One JSON file per session: <state-dir>/<sessionId>.json. The extension owns
// workflow/history; the IPython kernel owns bug/activity and other display
// fields. Both read-modify-write and preserve the other's fields.
function stateDir(): string {
  return process.env.ONCALL_STATE_DIR ?? join(homedir(), ".prime", "agent", "oncall");
}

function dashPath(): string {
  return join(stateDir(), `${sessionId}.json`);
}

function readExistingDash(): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(dashPath(), "utf8"));
  } catch {
    return {};
  }
}

function firstBugSummary(): string {
  return state.history.find((h) => h.step === 1)?.summary ?? "";
}

function stepStatus(id: number): string {
  if (state.finished) return "done";
  if (id < state.currentStep) return "done";
  if (id === state.currentStep) return state.awaitingApproval ? "awaiting_approval" : "in_progress";
  return "pending";
}

function writeDashboardState(): void {
  const existing = readExistingDash();
  const payload = {
    ...existing,
    version: 1,
    updatedAt: Date.now(),
    source: "extension",
    sessionId,
    sessionName,
    bug: (existing.bug as string) || firstBugSummary(),
    workflow: {
      currentStep: state.currentStep,
      awaitingApproval: state.awaitingApproval,
      rootCauseConfidence: state.rootCauseConfidence,
      finished: state.finished,
      steps: STEPS.map((s) => ({ id: s.id, name: s.name, label: s.label, status: stepStatus(s.id) })),
    },
    history: state.history.slice(-20).map((h) => ({ step: h.step, summary: h.summary, at: h.at })),
  };
  try {
    mkdirSync(dirname(dashPath()), { recursive: true });
    const tmp = `${dashPath()}.tmp`;
    writeFileSync(tmp, JSON.stringify(payload, null, 2));
    renameSync(tmp, dashPath());
  } catch {
    // The dashboard is optional. Never break the agent because of a file write.
  }
}

const PERSONA = `You are a senior principal engineer fixing a production bug with human-in-the-loop checkpoints.
You pause and wait for approval at every step. Never skip a stop.

The 8 steps:
1. Understand the bug — restate observed vs expected behavior, impact, unknowns.
2. Explore the codebase — trace entry points, call path, data flow, recent changes; form a root-cause hypothesis with evidence and a confidence number.
3. Reach >=95% confidence on the root cause — ask the user questions if needed. Do not proceed below 95% unless the user explicitly says "proceed anyway".
4. Reproduce the bug with a failing test. Provide Scylla/Redis/MySQL queries so the user can supply real prod data if needed.
5. Propose the fix — what changes, why, side effects, backward compatibility, rejected alternatives. Do NOT write code yet.
6. Implement the fix and update tests. Run the failing test and the affected module's suite.
7. Self-review — diff walkthrough, edge cases.
8. Release plan — blast radius, confidence score, PR description.

How to advance: at the end of each step, call the checkpoint tool with your deliverable summary (and confidence for steps 2 and 3). Then STOP and ask the user to approve before the next step. You may not skip steps or advance without approval.

Rules:
- One step at a time. Never do two steps in one turn.
- If confidence drops (a test shows your root cause is wrong), call checkpoint with the lower step number to reset and re-explore.
- Always answer in plain English, as if to an engineer new to this codebase.`;

function buildStatePrompt(): string {
  const s = STEPS.find((x) => x.id === state.currentStep);
  const lines = [
    "## Current State",
    `Step ${state.currentStep} of ${STEPS.length}: ${s?.name ?? "?"} — ${s?.label ?? "?"}`,
    `Root-cause confidence: ${state.rootCauseConfidence}%`,
  ];
  if (state.finished) {
    lines.push("All steps complete — hand off to the human for PR creation and deploy.");
  } else if (state.awaitingApproval) {
    lines.push(`WAITING for the user to approve step ${state.currentStep}. Do NOT start step ${state.currentStep + 1} until they confirm.`);
  }
  return lines.join("\n");
}

function asksForApproval(text: string): boolean {
  const tail = text.trim().slice(-400);
  return tail.includes("?") || /approve|confirm|proceed|good to go|look good|make sense|shall i|move on/i.test(tail);
}

function detectApproval(text: string): "approve" | "reject" | "neutral" {
  const t = text.toLowerCase().trim();
  const words = t.split(/\s+/).length;
  if (/reject|wrong|redo|incorrect|disagree|not yet|not quite|doesn'?t match/.test(t)) return "reject";
  if (/approved|approve|lgtm|ship it|proceed anyway|go ahead|good to go|sounds good|looks good|confirmed|confirm\b/.test(t)) return "approve";
  if (words <= 2 && /^(yes|yep|yeah|ok|okay|go|continue|correct|agreed|proceed)[.!]?$/.test(t)) return "approve";
  if (words <= 2 && /^no[.!]?$/.test(t)) return "reject";
  return "neutral";
}

function textResult(text: string) {
  return { content: [{ type: "text", text }] };
}
function errorResult(text: string) {
  return { content: [{ type: "text", text }], isError: true };
}

export default function oncallAgent(pi: ExtensionAPI) {
  const sync = () => {
    pi.appendEntry("oncall-state", { ...state });
    writeDashboardState();
  };

  const approveStep = () => {
    if (!state.awaitingApproval) return;
    state.awaitingApproval = false;
    state.steered = false;
    if (state.currentStep >= STEPS.length) state.finished = true;
    else state.currentStep += 1;
    sync();
  };

  const rejectStep = () => {
    if (!state.awaitingApproval) return;
    state.awaitingApproval = false;
    state.steered = false;
    sync();
  };

  pi.on("before_agent_start", async (event) => {
    return { systemPrompt: PERSONA + "\n\n" + buildStatePrompt() + "\n\n" + event.systemPrompt };
  });

  pi.on("session_start", async (_event, ctx) => {
    sessionId = ctx.sessionManager.getSessionId() ?? "unknown";
    sessionName = ctx.sessionManager.getSessionName() ?? "";
    const entries = ctx.sessionManager.getEntries();
    const last = entries
      .filter((e: any) => e.type === "custom" && e.customType === "oncall-state")
      .pop() as { data?: OncallState } | undefined;
    state = last?.data ? { ...freshState(), ...last.data } : freshState();
    writeDashboardState();
  });

  pi.on("session_shutdown", async () => {
    pi.appendEntry("oncall-state", { ...state });
  });

  pi.on("turn_end", async (event) => {
    if (event.message.role !== "assistant") return;
    if (!state.awaitingApproval || state.steered) return;
    const text = event.message.content
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");
    if (!asksForApproval(text)) {
      state.steered = true;
      pi.sendUserMessage(
        `You recorded a checkpoint for step ${state.currentStep} but didn't ask the user to approve. Show your deliverable, then ask them to confirm before step ${state.currentStep + 1}. End with a question.`,
        { deliverAs: "steer" },
      );
    }
  });

  pi.on("input", async (event) => {
    if (!state.awaitingApproval) return { action: "continue" };
    if (event.source === "extension") return { action: "continue" };
    const verdict = detectApproval(event.text);
    if (verdict === "approve") approveStep();
    else if (verdict === "reject") rejectStep();
    return { action: "continue" };
  });

  pi.registerTool({
    name: "checkpoint",
    label: "Checkpoint (mark step complete)",
    description:
      "Call this when you have FINISHED a step and need the user to review/approve before moving to the next step. Never skip a step.",
    parameters: Type.Object({
      step: Type.Integer({ description: "The step number you just finished (1-8). Must equal your current step." }),
      summary: Type.String({ description: "Your deliverable in 1-3 sentences for the human to review." }),
      confidence: Type.Optional(Type.Number({ description: "Root-cause confidence 0-100. Provide for steps 2 and 3." })),
      proceedAnyway: Type.Optional(
        Type.Boolean({ description: "True ONLY if the user explicitly said 'proceed anyway' while confidence is below 95." }),
      ),
    }),
    async execute(_toolCallId, params) {
      const step = Math.round(params.step);

      if (step < state.currentStep) {
        state.currentStep = step;
        state.awaitingApproval = false;
        state.steered = false;
        state.finished = false;
        sync();
        return textResult(`Reset to step ${step}. Tell the user your confidence dropped and re-explore from step ${step}.`);
      }

      if (step !== state.currentStep) {
        return errorResult(
          `BLOCKED: you are on step ${state.currentStep}, not step ${step}. Finish step ${state.currentStep} first. You cannot skip ahead.`,
        );
      }

      if (step === 2 && params.confidence !== undefined) {
        state.rootCauseConfidence = clampConfidence(params.confidence);
      }

      if (step === 3) {
        const confidence = params.confidence !== undefined ? clampConfidence(params.confidence) : state.rootCauseConfidence;
        state.rootCauseConfidence = confidence;
        if (confidence < 95 && !params.proceedAnyway) {
          return errorResult(
            `Confidence is ${confidence}%, below 95%. You cannot pass step 3 unless the user explicitly says "proceed anyway". If they said that, call checkpoint again with proceedAnyway: true.`,
          );
        }
      }

      state.awaitingApproval = true;
      state.steered = false;
      state.history.push({ step, summary: params.summary ?? "", at: Date.now() });
      sync();
      return textResult(
        `Checkpoint recorded for step ${step}. STOP now. Show the user your deliverable and ask them to approve moving to step ${step + 1}. End your message with a question.`,
      );
    },
  });

  pi.registerCommand("oncall", {
    description: "On-call agent status and controls",
    handler: async (args, ctx) => {
      const arg = args.trim();
      if (arg === "approve") {
        approveStep();
        ctx.ui.notify("Approved — moving on.", "info");
        return;
      }
      if (arg === "reject") {
        rejectStep();
        ctx.ui.notify("Rejected — staying on the current step.", "info");
        return;
      }
      if (arg === "reset") {
        state = freshState();
        sync();
        ctx.ui.notify("Reset to step 1.", "info");
        return;
      }
      const s = STEPS.find((x) => x.id === state.currentStep);
      const lines = [
        `On-call agent — step ${state.currentStep} of ${STEPS.length}: ${s?.label ?? "?"}`,
        `Session: ${sessionId}`,
        `Confidence: ${state.rootCauseConfidence}%`,
        state.finished ? "Status: all done." : state.awaitingApproval ? "Status: awaiting your approval." : "Status: in progress.",
      ];
      if (state.history.length > 0) {
        lines.push(`Checkpoints: ${state.history.map((h) => h.step).join(", ")}`);
      }
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
