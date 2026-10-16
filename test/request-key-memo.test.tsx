// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { useState } from "react";

// A pass-through spy: the hooks still get real keys, and the test counts how often they hash.
vi.mock("@/lib/request-key", async (orig) => {
  const real = await orig<typeof import("@/lib/request-key")>();
  return { ...real, requestKey: vi.fn(real.requestKey) };
});
vi.mock("@/lib/kit/client", () => ({ getUnmap: () => null }));

import { useCheck } from "../hooks/use-check";
import { useSolve } from "../hooks/use-solve";
import { requestKey } from "../lib/request-key";
import type { Json } from "../lib/scenario/load";

function Probe({ request }: { request: Json }) {
  const [n, setN] = useState(0);
  useCheck(request);
  useSolve(request);
  return (
    <button type="button" onClick={() => setN(n + 1)}>
      {n}
    </button>
  );
}

afterEach(cleanup);

describe("request key memoisation", () => {
  it("is not recomputed when only an unrelated state changes, and is when the request does", () => {
    const spy = vi.mocked(requestKey);
    spy.mockClear();
    const request: Json = { model: { shipments: [{ label: "a" }] } };
    const { rerender, getByRole } = render(<Probe request={request} />);
    expect(spy).toHaveBeenCalledTimes(2); // once per hook
    fireEvent.click(getByRole("button"));
    fireEvent.click(getByRole("button"));
    expect(getByRole("button").textContent).toBe("2");
    expect(spy).toHaveBeenCalledTimes(2);
    rerender(<Probe request={{ ...request }} />);
    expect(spy).toHaveBeenCalledTimes(4);
  });
});
