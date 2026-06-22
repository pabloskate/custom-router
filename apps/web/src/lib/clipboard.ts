export const CLIPBOARD_COPY_ERROR = "Copy failed. Check browser clipboard permissions or copy manually.";

export async function copyTextToClipboard(value: string): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return { ok: false, error: CLIPBOARD_COPY_ERROR };
  }

  try {
    await navigator.clipboard.writeText(value);
    return { ok: true };
  } catch {
    return { ok: false, error: CLIPBOARD_COPY_ERROR };
  }
}
