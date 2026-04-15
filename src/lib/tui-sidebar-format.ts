import type { QuotaRenderData } from "./quota-render-data.js";
import type { QuotaToastConfig } from "./types.js";

import { sanitizeQuotaRenderData } from "./display-sanitize.js";
import { formatQuotaRows } from "./format.js";

export const TUI_SIDEBAR_MAX_WIDTH = 36;

export function buildSidebarQuotaPanelLines(params: {
  data: QuotaRenderData;
  config: Pick<QuotaToastConfig, "toastStyle" | "layout">;
}): string[] {
  const data = sanitizeQuotaRenderData(params.data);
  const maxWidth = Math.max(1, Math.min(params.config.layout.maxWidth, TUI_SIDEBAR_MAX_WIDTH));
  const narrowAt = Math.max(1, Math.min(params.config.layout.narrowAt, maxWidth));
  const tinyAt = Math.max(1, Math.min(params.config.layout.tinyAt, narrowAt));

  const formatted = formatQuotaRows({
    version: "1.0.0",
    layout: {
      maxWidth,
      narrowAt,
      tinyAt,
    },
    entries: data.entries,
    errors: data.errors,
    style: params.config.toastStyle,
    sessionTokens: data.sessionTokens,
  });

  return formatted ? formatted.split("\n") : [];
}
