// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

// No key in the test build: the app must explain how to get one instead of calling anything.
vi.mock("@/lib/kit/config", async (orig) => ({ ...(await orig<typeof import("@/lib/kit/config")>()), API_KEY: "" }));

import { FleetApp } from "../components/fleet/fleet-app";

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("Fleet Optimizer without a key", () => {
  it("asks for a key and never calls the network", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    render(<FleetApp />);
    expect(screen.getByText("This app needs an Unmap API key")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Fleet Optimizer" })).toBeTruthy();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
