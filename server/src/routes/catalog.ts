import { Hono } from "hono";
import { getApiCatalog } from "../catalog/apis.js";

export const catalogRouter = new Hono();

catalogRouter.get("/", (c) => {
  return c.json({
    success: true,
    apis: getApiCatalog(),
  });
});
