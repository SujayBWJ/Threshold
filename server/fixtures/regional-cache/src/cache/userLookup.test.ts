import test from "node:test";
import assert from "node:assert/strict";
import { findUser } from "./userLookup.js";

test("does not share users between regions", async () => {
  const us = await findUser("user-42", "us-east", async () => ({
    id: "user-42",
    region: "us-east",
    name: "US user",
  }));
  const eu = await findUser("user-42", "eu-west", async () => ({
    id: "user-42",
    region: "eu-west",
    name: "EU user",
  }));
  assert.equal(us.region, "us-east");
  assert.equal(eu.region, "eu-west");
});
