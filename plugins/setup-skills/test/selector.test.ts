import { describe, expect, test } from "bun:test";
import { ProjectSkillsSelector } from "../src/selector";
import type { ProjectSkillsState } from "../src/project-skills";

const theme = {
  fg: (_color: string, text: string) => text,
  bg: (_color: string, text: string) => text,
  bold: (text: string) => text,
};

function state(): ProjectSkillsState {
  return {
    projectRoot: "/repo",
    configPath: "/repo/.omp/config.yml",
    config: {},
    skills: {},
    includeMode: false,
    warnings: [],
    rows: [
      {
        name: "hidden",
        description: "hidden description",
        filePath: "/repo/.omp/skills/hidden/SKILL.md",
        source: "project",
        enabled: true,
        agentInvokable: false,
        userInvokable: true,
      },
      {
        name: "normal",
        description: "normal description",
        filePath: "/repo/.omp/skills/normal/SKILL.md",
        source: "project",
        enabled: true,
        agentInvokable: true,
        userInvokable: true,
      },
    ],
  };
}

describe("ProjectSkillsSelector", () => {
  test("renders invocation badges that distinguish user-only hidden skills from normal skills", () => {
    const selector = new ProjectSkillsSelector(state(), theme, () => {}, () => {});

    const rendered = selector.render(120).join("\n");

    expect(rendered).toContain("hidden project [user] — hidden description");
    expect(rendered).toContain("normal project [agent+user] — normal description");
  });
});
