import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TEST_EMAIL_TEXT } from "@/test/data";
import { mount, unmountAll } from "@/test/popup-app";
import { CopyButton } from "./CopyButton";

const writeText = vi.fn<(text: string) => Promise<void>>();
function mountButton(): Promise<HTMLElement> {
  return mount(<CopyButton email={TEST_EMAIL_TEXT} />);
}

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  vi.useFakeTimers();
});

afterEach(async () => {
  await unmountAll();
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe("CopyButton", () => {
  it("copies the email and says 'Copied' for two seconds", async () => {
    writeText.mockResolvedValue();
    const root = await mountButton();
    await act(() => {
      root.querySelector("button")?.click();
    });
    await vi.waitFor(() => {
      expect(root.textContent).toBe("Copied");
    });
    expect(writeText).toHaveBeenCalledWith(TEST_EMAIL_TEXT);
    expect(root.querySelector("button")?.getAttribute("aria-label")).toBe("Email copied");
    await act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(root.textContent).toBe("Copy");
  });

  it("says 'Copy failed' for two seconds when the clipboard refuses", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    const root = await mountButton();
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
