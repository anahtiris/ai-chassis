import { jsonSchema, tool, type Tool } from "ai";
import {
  tableToolDefinition,
  tableToolHandler,
  dashboardToolDefinition,
  dashboardToolHandler,
  formToolDefinition,
  formToolHandler,
  questionToolDefinition,
  questionToolHandler,
  diagramToolDefinition,
  diagramToolHandler,
} from "generative-ui-kit";
import type { ToolDefinition } from "generative-ui-kit";

// Bridges generative-ui-kit's tool defs/handlers (JSON-schema based, provider-
// agnostic) into the Vercel AI SDK's tool-calling shape used by
// lib/ai/concierge.ts's generateText call. Deliberately single-step: no
// `execute` on the AI SDK tool, so generateText returns the tool call without
// running it or continuing the model — concierge.ts runs the matching kit
// handler itself and returns the render payload directly. This mirrors the
// generative-ui-playground reference server (apps/playground/app/api/chat/
// route.ts), which does the same "one model call, then run the handler,
// don't loop back into the model" single-step pattern.
const definitions: ToolDefinition[] = [
  tableToolDefinition,
  dashboardToolDefinition,
  formToolDefinition,
  questionToolDefinition,
  diagramToolDefinition,
];

type ToolHandler = (
  input: Record<string, unknown>,
) => Promise<{ render: unknown; forModel: unknown }>;

// Registry boundary cast: same reasoning as generative-ui-kit's own
// defaultRenderers/toolHandlers registries — each handler's input type is
// more specific than Record<string, unknown>, so a targeted cast per entry,
// not a blanket `any`.
export const generativeToolHandlers: Record<string, ToolHandler> = {
  [tableToolDefinition.name]: tableToolHandler as ToolHandler,
  [dashboardToolDefinition.name]: dashboardToolHandler as ToolHandler,
  [formToolDefinition.name]: formToolHandler as ToolHandler,
  [questionToolDefinition.name]: questionToolHandler as ToolHandler,
  [diagramToolDefinition.name]: diagramToolHandler as ToolHandler,
};

export const generativeTools: Record<string, Tool> = Object.fromEntries(
  definitions.map((def) => [
    def.name,
    tool({
      description: def.description,
      parameters: jsonSchema(def.input_schema as never),
    }),
  ]),
);

// Mechanical tool-usage instructions, appended to whatever system prompt the
// admin configured (lib/ai/promptVersions.ts's prompt_text is about business
// content/tone — an admin shouldn't need to know generative-ui-kit's tool
// names to get correct tool-calling behavior). Wording follows the reference
// system prompt in generative-ui-playground's chat route.
export const GENERATIVE_TOOL_GUIDANCE = `
When you need the user to submit sensitive personal data, call ${formToolDefinition.name} — never ask for it in plain chat text.
Use ${dashboardToolDefinition.name} and ${tableToolDefinition.name} to visualize data when it would help the user.
Use ${questionToolDefinition.name} when you need a specific answer from the user to proceed — pick "buttons" for a quick pick among short labels, "radio" for a single pick among longer option text, and "checkboxes" when more than one answer can apply at once.
Use ${diagramToolDefinition.name} to visualize relationships, flows, or structures as a node/edge diagram.
`.trim();
