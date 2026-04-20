const SIDEBAR_LOADING_LINE = "Loading…";
const SIDEBAR_UNAVAILABLE_LINE = "Unavailable";

export type SidebarPanelState = {
  status: "loading" | "disabled" | "ready";
  lines: string[];
};

export function shouldRenderSidebarPanel(panel: SidebarPanelState): boolean {
  return panel.status !== "disabled";
}

export function getSidebarPanelLines(panel: SidebarPanelState): string[] {
  if (panel.lines.length > 0) return panel.lines;

  switch (panel.status) {
    case "ready":
      return [SIDEBAR_UNAVAILABLE_LINE];
    case "loading":
      return [SIDEBAR_LOADING_LINE];
    default:
      return [];
  }
}
