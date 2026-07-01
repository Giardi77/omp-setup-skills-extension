import type { Component, TUI } from "@oh-my-pi/pi-tui";
import { Ellipsis, matchesKey, truncateToWidth } from "@oh-my-pi/pi-tui";
import type { ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import type { ProjectSkillsState } from "./project-skills";

type Done = (result: Set<string> | null) => void;

type ThemeLike = {
  fg(color: string, text: string): string;
  bg(color: string, text: string): string;
  bold(text: string): string;
};

function color(theme: ThemeLike, colorName: string, text: string): string {
  try {
    return theme.fg(colorName, text);
  } catch {
    return text;
  }
}

function bold(theme: ThemeLike, text: string): string {
  try {
    return theme.bold(text);
  } catch {
    return text;
  }
}

function selected(theme: ThemeLike, text: string): string {
  try {
    return theme.bg("selectedBg", text);
  } catch {
    return text;
  }
}

export class ProjectSkillsSelector implements Component {
  #selectedIndex = 0;
  #selectedNames: Set<string>;

  constructor(
    private readonly state: ProjectSkillsState,
    private readonly theme: ThemeLike,
    private readonly requestRender: () => void,
    private readonly done: Done,
  ) {
    this.#selectedNames = new Set(state.rows.filter(row => row.enabled).map(row => row.name));
  }

  invalidate(): void {
    // Rendering is derived from state and current selection.
  }

  render(width: number): readonly string[] {
    const lines: string[] = [];
    const rows = this.state.rows;
    const mode = this.state.includeMode ? "allowlist" : "blocklist";
    const selectedCount = this.#selectedNames.size;
    const muted = (text: string) => color(this.theme, "muted", text);
    const dim = (text: string) => color(this.theme, "dim", text);

    lines.push(bold(this.theme, color(this.theme, "accent", "Project skills")));
    lines.push(muted(truncateToWidth(this.state.projectRoot, width, Ellipsis.Omit)));
    lines.push(muted(`writes ${truncateToWidth(this.state.configPath, Math.max(0, width - 7), Ellipsis.Omit)}`));
    lines.push("");
    lines.push(`${bold(this.theme, String(selectedCount))}/${rows.length} enabled  ${muted(`save mode: ${mode}`)}`);

    if (this.state.warnings.length > 0) {
      lines.push(color(this.theme, "warning", `warnings: ${this.state.warnings.length}`));
    }

    lines.push("");

    if (rows.length === 0) {
      lines.push(muted("No skills discovered for this project."));
      lines.push(muted("Add skills under .omp/skills/<name>/SKILL.md, then run /setup-skills again."));
      lines.push("");
      lines.push(dim("Esc/Ctrl-C: close"));
      return lines;
    }

    const reservedLines = 10;
    const terminalRows = process.stdout.rows || 24;
    const maxVisible = Math.max(5, Math.min(rows.length, terminalRows - reservedLines));
    const startIndex = Math.max(0, Math.min(this.#selectedIndex - Math.floor(maxVisible / 2), rows.length - maxVisible));
    const endIndex = Math.min(rows.length, startIndex + maxVisible);

    for (let index = startIndex; index < endIndex; index++) {
      const row = rows[index];
      if (!row) continue;

      const focused = index === this.#selectedIndex;
      const enabled = this.#selectedNames.has(row.name);
      const checkbox = enabled ? color(this.theme, "success", "[x]") : dim("[ ]");
      const source = muted(row.source);
      const desc = row.description ? dim(` — ${row.description}`) : "";
      const prefix = focused ? color(this.theme, "accent", "›") : " ";
      let line = `${prefix} ${checkbox} ${bold(this.theme, row.name)} ${source}${desc}`;
      line = truncateToWidth(line, width, Ellipsis.Omit);

      if (focused) {
        line = selected(this.theme, line);
      } else if (!enabled) {
        line = dim(line);
      }
      lines.push(line);
    }

    if (rows.length > maxVisible) {
      lines.push(muted(`  (${this.#selectedIndex + 1}/${rows.length})`));
    }

    lines.push("");
    lines.push(dim(truncateToWidth("↑/↓ or j/k navigate  Space toggle  a all  n none  Enter confirm + reload  Esc cancel", width, Ellipsis.Omit)));
    return lines;
  }

  handleInput(data: string): void {
    const rows = this.state.rows;

    if (matchesKey(data, "escape") || matchesKey(data, "esc") || matchesKey(data, "ctrl+c")) {
      this.done(null);
      return;
    }

    if (rows.length === 0) {
      return;
    }

    if (matchesKey(data, "up") || data === "k") {
      this.#selectedIndex = this.#selectedIndex === 0 ? rows.length - 1 : this.#selectedIndex - 1;
      this.requestRender();
      return;
    }

    if (matchesKey(data, "down") || data === "j") {
      this.#selectedIndex = this.#selectedIndex === rows.length - 1 ? 0 : this.#selectedIndex + 1;
      this.requestRender();
      return;
    }

    if (matchesKey(data, "pageUp")) {
      this.#selectedIndex = Math.max(0, this.#selectedIndex - 10);
      this.requestRender();
      return;
    }

    if (matchesKey(data, "pageDown")) {
      this.#selectedIndex = Math.min(rows.length - 1, this.#selectedIndex + 10);
      this.requestRender();
      return;
    }

    if (data === "a") {
      this.#selectedNames = new Set(rows.map(row => row.name));
      this.requestRender();
      return;
    }

    if (data === "n") {
      this.#selectedNames.clear();
      this.requestRender();
      return;
    }

    if (matchesKey(data, "space") || data === " ") {
      const row = rows[this.#selectedIndex];
      if (!row) return;

      if (this.#selectedNames.has(row.name)) {
        this.#selectedNames.delete(row.name);
      } else {
        this.#selectedNames.add(row.name);
      }
      this.requestRender();
      return;
    }

    if (matchesKey(data, "enter") || matchesKey(data, "return") || data === "\n") {
      this.done(new Set(this.#selectedNames));
    }
  }
}

export async function runProjectSkillsSelector(
  ctx: ExtensionCommandContext,
  state: ProjectSkillsState,
): Promise<Set<string> | null> {
  return ctx.ui.custom<Set<string> | null>((tui: TUI, theme, _keybindings, done) => {
    return new ProjectSkillsSelector(state, theme as unknown as ThemeLike, () => tui.requestRender(), done);
  }, { overlay: true });
}
