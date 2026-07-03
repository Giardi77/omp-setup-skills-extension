import type { ExtensionAPI } from "@oh-my-pi/pi-coding-agent";
import { loadProjectSkillsState, writeProjectSkillsSelection } from "./project-skills";
import { runProjectSkillsSelector } from "./selector";

function formatSavedSummary(configPath: string, enabledCount: number, totalCount: number): string {
  const disabledCount = Math.max(0, totalCount - enabledCount);
  return `Updated ${configPath} (${enabledCount} enabled, ${disabledCount} disabled). Reloading skills when the agent is idle...`;
}

export default function setupSkillsExtension(pi: ExtensionAPI): void {
  pi.setLabel("Setup Skills");

  pi.registerCommand("setup-skills", {
    description: "Select enabled skills for this project and reload the session",
    handler: async (_args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify("/setup-skills requires the interactive OMP UI.", "error");
        return;
      }

      let state;
      try {
        state = await loadProjectSkillsState(ctx.cwd);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, "error");
        return;
      }

      const selectedNames = await runProjectSkillsSelector(ctx, state);
      if (selectedNames === null) {
        ctx.ui.notify("Project skills unchanged.", "info");
        return;
      }

      try {
        await writeProjectSkillsSelection(state, selectedNames);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        ctx.ui.notify(message, "error");
        return;
      }

      ctx.ui.notify(formatSavedSummary(state.configPath, selectedNames.size, state.rows.length), "info");
      await ctx.waitForIdle();
      await ctx.reload();
    },
  });
}
