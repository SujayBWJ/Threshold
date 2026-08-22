import { Hono } from "hono";
import {
  runIncidentPaymentFlow,
  type IncidentBugId,
  type IncidentFlowEvent,
} from "../services/payment/incident-flow.js";

export const runPaymentFlowRouter = new Hono();

runPaymentFlowRouter.post("/", async (c) => {
  let body: unknown = {};
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }

  const options = typeof body === "object" && body !== null ? body as Record<string, unknown> : {};
  const useTestnet = options.network === "testnet";
  const emptyWallet = options.wallet === "empty";
  const bugId = options.bug === "regional-cache" ? "regional-cache" : "divide";
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: IncidentFlowEvent) => {
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      };
      void runIncidentPaymentFlow({ useTestnet, emptyWallet, bugId: bugId as IncidentBugId, emit: send }).finally(() => controller.close());
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
});
