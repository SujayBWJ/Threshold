import { Hono } from "hono";

export const testRouter = new Hono();

testRouter.get("/", (c) => {
  return c.json({
    project: "Threshold",
    endpoint: "/api/test",
    paid: true,
    message: "Payment verified. Test gate unlocked.",
  });
});
