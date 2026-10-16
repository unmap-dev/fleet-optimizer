// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { UnmapOptimizeError } from "@unmap/sdk";
import { OptimizeProblemAlert, waitText } from "../components/fleet/optimize-problem";
import { classifyOptimizeError } from "../hooks/optimize-error";
import { format, formatNumber } from "../lib/kit/i18n";
import { TEXT } from "../lib/text";

type Lang = "en" | "fr";

afterEach(cleanup);

function show(error: unknown, lang: Lang, onRetry = vi.fn()) {
  render(<OptimizeProblemAlert problem={classifyOptimizeError(error)} lang={lang} onRetry={onRetry} retryLabel={TEXT[lang].report.checkAgain} />);
  return onRetry;
}

const retries = () => document.querySelectorAll("button");

describe.each<Lang>(["en", "fr"])("OptimizeProblemAlert (%s)", (lang) => {
  const t = TEXT[lang].problem;

  it("says plainly that a spent allowance needs your own key, with no retry", () => {
    for (const code of ["quota_exceeded", "spend_cap", "billing_required"]) {
      show(new UnmapOptimizeError(429, "quota", code, 3600, "RESOURCE_EXHAUSTED"), lang);
      const alert = document.querySelector('[data-problem="quota"]') as HTMLElement;
      expect(alert.getAttribute("data-code")).toBe(code);
      expect(alert.textContent).toContain(t.quotaTitle);
      expect(alert.textContent).toContain(t.quota);
      expect(retries()).toHaveLength(0);
      cleanup();
    }
  });

  it("gives a short rate limit a readable wait and a retry", () => {
    const onRetry = show(new UnmapOptimizeError(429, "slow", "rate_limited", 120, "RESOURCE_EXHAUSTED"), lang);
    const alert = document.querySelector('[data-problem="rate-limited"]') as HTMLElement;
    expect(alert.textContent).toContain(format(t.rateMinutes, { n: formatNumber(2, lang) }));
    const button = alert.querySelector("button[data-retry]") as HTMLButtonElement;
    expect(button.textContent).toContain(TEXT[lang].report.checkAgain);
    fireEvent.click(button);
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("formats waits as seconds under 90, then minutes, then hours, in the visitor's locale", () => {
    expect(waitText(undefined, lang)).toBe(t.rateLater);
    expect(waitText(45, lang)).toBe(format(t.rateSeconds, { n: formatNumber(45, lang) }));
    expect(waitText(3600, lang)).toBe(format(t.rateMinutes, { n: formatNumber(60, lang) }));
    expect(waitText(7200, lang)).toBe(format(t.rateHours, { n: formatNumber(2, lang) }));
  });

  it("offers one retry for a 503 and for a 504", () => {
    // The kit's own button is not drawn as well: one button, in the app's words.
    for (const status of [503, 504]) {
      const onRetry = show(new UnmapOptimizeError(status, "down", undefined, undefined, "UNAVAILABLE"), lang);
      expect(retries()).toHaveLength(1);
      fireEvent.click(retries()[0]!);
      expect(onRetry).toHaveBeenCalledTimes(1);
      cleanup();
    }
  });

  it("offers the same retry for a 502 and none for a 400", () => {
    show(new UnmapOptimizeError(502, "bad gateway"), lang);
    expect(retries()).toHaveLength(1);
    expect(retries()[0]!.textContent).toBe(TEXT[lang].report.checkAgain);
    cleanup();
    show(new UnmapOptimizeError(400, "bad", "bad_request", undefined, "INVALID_ARGUMENT"), lang);
    expect(retries()).toHaveLength(0);
  });
});
