import { test, expect } from "bun:test";
import { dashboardPage } from "./templates.ts";

test("dashboardPage renders a left picker pane, a right log pane, and a divider", () => {
  const html = dashboardPage();
  expect(html).toContain("<!DOCTYPE html>");
  expect(html).toContain('id="left" src="/picker"');
  expect(html).toContain('id="right" src="/log"');
  expect(html).toContain('id="divider"');
});

test("dashboardPage wires up draggable-divider behavior", () => {
  const html = dashboardPage();
  expect(html).toContain('"mousedown"');
  expect(html).toContain('"mousemove"');
});
