import { Hono } from "hono";
import {
  runIncidentPaymentFlow,
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
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: IncidentFlowEvent) => {
        controller.enqueue(encoder.encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`));
      };
      void runIncidentPaymentFlow({ useTestnet, emptyWallet, emit: send }).finally(() => controller.close());
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
