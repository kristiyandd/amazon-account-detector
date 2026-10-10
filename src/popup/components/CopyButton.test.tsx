import { render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyButton } from "./CopyButton";

const writeText = vi.fn<(text: string) => Promise<void>>();
let host: HTMLElement | null = null;

async function mount(): Promise<HTMLElement> {
  const root = document.createElement("div");
  document.body.append(root);
  host = root;
  await act(() => {
    render(<CopyButton email="test.user@example.com" />, root);
  });
  return root;
}

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  vi.useFakeTimers();
});

afterEach(async () => {
  await act(() => {
    if (host !== null) {
      render(null, host);
    }
  });
  host = null;
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("CopyButton", () => {
  it("copies the email and says 'Copied' for two seconds", async () => {
    writeText.mockResolvedValue();
    const root = await mount();
    await act(() => {
      root.querySelector("button")?.click();
    });
    await vi.waitFor(() => {
      expect(root.textContent).toBe("Copied");
    });
    expect(writeText).toHaveBeenCalledWith("test.user@example.com");
    expect(root.querySelector("button")?.getAttribute("aria-label")).toBe("Email copied");
    await act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(root.textContent).toBe("Copy");
  });

  it("says 'Copy failed' for two seconds when the clipboard refuses", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const root = await mount();
    await act(() => {
      root.querySelector("button")?.click();
    });
    await vi.waitFor(() => {
      expect(root.textContent).toBe("Copy failed");
    });
    await act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(root.textContent).toBe("Copy");
  });
});
