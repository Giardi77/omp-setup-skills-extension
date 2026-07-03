import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { YAML } from "bun";
import type { LoadSkillsOptions, Skill } from "@oh-my-pi/pi-coding-agent/extensibility/skills";
import {
  buildUpdatedSkillsSection,
  isSkillEnabledByProjectConfig,
  loadProjectSkillsState,
  resolveProjectSkillsRoot,
  writeProjectSkillsSelection,
  type ProjectSkillRow,
} from "../src/project-skills";

const tempRoots: string[] = [];

async function makeTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-setup-skills-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

function skill(name: string, root: string, overrides: Partial<Skill> = {}): Skill {
  return {
    name,
    description: `${name} description`,
    filePath: path.join(root, ".omp", "skills", `${name}.md`),
    baseDir: path.join(root, ".omp", "skills"),
    source: "project",
    ...overrides,
  };
}

function row(name: string): ProjectSkillRow {
  return {
    name,
    description: `${name} description`,
    filePath: `/skills/${name}.md`,
    source: "project",
    enabled: true,
    agentInvokable: true,
    userInvokable: true,
  };
}

describe("resolveProjectSkillsRoot", () => {
  test("chooses the nearest non-home .omp directory from a nested cwd", async () => {
    const root = await makeTempRoot();
    const fakeHome = path.join(root, "home");
    const project = path.join(fakeHome, "work", "repo");
    const nested = path.join(project, "packages", "plugin", "src");
    await fs.mkdir(path.join(fakeHome, ".omp"), { recursive: true });
    await fs.mkdir(path.join(project, ".git"), { recursive: true });
    await fs.mkdir(path.join(project, ".omp"), { recursive: true });
    await fs.mkdir(nested, { recursive: true });

    const originalHome = process.env.HOME;
    process.env.HOME = fakeHome;
    try {
      await expect(resolveProjectSkillsRoot(nested)).resolves.toBe(project);
    } finally {
      if (originalHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = originalHome;
      }
    }
  });

  test("falls back to the nearest .git ancestor when no project .omp exists", async () => {
    const root = await makeTempRoot();
    const outer = path.join(root, "outer");
    const repo = path.join(outer, "repo");
    const nested = path.join(repo, "packages", "extension", "src");
    await fs.mkdir(path.join(outer, ".git"), { recursive: true });
    await fs.mkdir(path.join(repo, ".git"), { recursive: true });
    await fs.mkdir(nested, { recursive: true });

    await expect(resolveProjectSkillsRoot(nested)).resolves.toBe(repo);
  });
});

describe("isSkillEnabledByProjectConfig", () => {
  test("applies global disable, ignored glob blocklists, and include allowlists in precedence order", () => {
    expect(isSkillEnabledByProjectConfig("anything", { enabled: false, includeSkills: ["anything"] })).toBe(false);
    expect(isSkillEnabledByProjectConfig("team/review", { ignoredSkills: ["team/*"] })).toBe(false);
    expect(isSkillEnabledByProjectConfig("team/review", { includeSkills: ["team/*"] })).toBe(true);
    expect(isSkillEnabledByProjectConfig("other/review", { includeSkills: ["team/*"] })).toBe(false);
    expect(
      isSkillEnabledByProjectConfig("team/review", {
        ignoredSkills: ["team/*"],
        includeSkills: ["team/review"],
      }),
    ).toBe(false);
    expect(isSkillEnabledByProjectConfig("unlisted", {})).toBe(true);
  });
});

describe("buildUpdatedSkillsSection", () => {
  test("writes blocklist mode as sorted ignoredSkills while preserving unrelated skill discovery settings", () => {
    const next = buildUpdatedSkillsSection(
      {
        customDirectories: ["skills/custom"],
        enableCodexUser: false,
        includeSkills: ["legacy-allowlist"],
      },
      [row("gamma"), row("beta"), row("alpha")],
      new Set(["alpha", "gamma"]),
      false,
    );

    expect(next).toEqual({
      customDirectories: ["skills/custom"],
      enableCodexUser: false,
      enabled: true,
      includeSkills: [],
      ignoredSkills: ["beta"],
    });
  });

  test("writes allowlist mode as sorted includeSkills and clears ignoredSkills", () => {
    const next = buildUpdatedSkillsSection(
      {
        ignoredSkills: ["legacy-blocklist"],
        customDirectories: ["skills/custom"],
      },
      [row("gamma"), row("beta"), row("alpha")],
      new Set(["gamma", "alpha"]),
      true,
    );

    expect(next).toEqual({
      ignoredSkills: [],
      customDirectories: ["skills/custom"],
      enabled: true,
      includeSkills: ["alpha", "gamma"],
    });
  });
});

describe("loadProjectSkillsState", () => {
  test("loads discovery from the project root with project filters cleared but source and custom directory settings preserved", async () => {
    const root = await makeTempRoot();
    const project = path.join(root, "repo");
    const nested = path.join(project, "app", "src");
    await fs.mkdir(path.join(project, ".omp"), { recursive: true });
    await fs.mkdir(nested, { recursive: true });
    await Bun.write(
      path.join(project, ".omp", "config.yml"),
      YAML.stringify({
        skills: {
          enabled: false,
          ignoredSkills: ["blocked/*"],
          includeSkills: ["allowed/*"],
          disabledExtensions: ["extension-a"],
          customDirectories: ["skills/custom"],
          enableCodexUser: false,
          enablePiProject: true,
        },
      }),
    );

    const calls: LoadSkillsOptions[] = [];
    const state = await loadProjectSkillsState(nested, async options => {
      calls.push(options);
      return {
        skills: [skill("allowed/review", project), skill("blocked/review", project)],
        warnings: [{ skillPath: path.join(project, ".omp", "skills", "bad.md"), message: "bad frontmatter" }],
      };
    });

    expect(calls).toEqual([
      {
        cwd: project,
        enabled: true,
        ignoredSkills: [],
        includeSkills: [],
        disabledExtensions: [],
        customDirectories: ["skills/custom"],
        enableCodexUser: false,
        enablePiProject: true,
      },
    ]);
    expect(state.projectRoot).toBe(project);
    expect(state.includeMode).toBe(true);
    expect(state.rows.map(({ name, enabled }) => ({ name, enabled }))).toEqual([
      { name: "allowed/review", enabled: false },
      { name: "blocked/review", enabled: false },
    ]);
    expect(state.warnings).toEqual([`${path.join(project, ".omp", "skills", "bad.md")}: bad frontmatter`]);
  });

  test("marks skills as not user-invokable when project skill commands are disabled while hide still controls agent invocation", async () => {
    const root = await makeTempRoot();
    const project = path.join(root, "repo");
    await fs.mkdir(path.join(project, ".omp"), { recursive: true });
    await Bun.write(
      path.join(project, ".omp", "config.yml"),
      YAML.stringify({
        skills: {
          enableSkillCommands: false,
        },
      }),
    );

    const state = await loadProjectSkillsState(project, async () => ({
      skills: [skill("hidden", project, { hide: true }), skill("normal", project)],
      warnings: [],
    }));

    expect(
      state.rows.map(row => ({
        name: row.name,
        agentInvokable: row.agentInvokable,
        userInvokable: row.userInvokable,
      })),
    ).toEqual([
      { name: "hidden", agentInvokable: false, userInvokable: false },
      { name: "normal", agentInvokable: true, userInvokable: false },
    ]);
  });
});

describe("writeProjectSkillsSelection", () => {
  test("writes .omp/config.yml YAML with updated skills while preserving unrelated top-level config", async () => {
    const root = await makeTempRoot();
    const project = path.join(root, "repo");
    const configPath = path.join(project, ".omp", "config.yml");

    const next = await writeProjectSkillsSelection(
      {
        config: {
          model: "claude-sonnet",
          theme: { dark: "titanium" },
          skills: {
            customDirectories: ["skills/custom"],
            ignoredSkills: ["old-disabled"],
          },
        },
        configPath,
        includeMode: false,
        rows: [row("alpha"), row("beta")],
        skills: {
          customDirectories: ["skills/custom"],
          ignoredSkills: ["old-disabled"],
        },
      },
      new Set(["alpha"]),
    );

    expect(next).toEqual({
      customDirectories: ["skills/custom"],
      enabled: true,
      includeSkills: [],
      ignoredSkills: ["beta"],
    });

    const written = YAML.parse(await Bun.file(configPath).text());
    expect(written).toEqual({
      model: "claude-sonnet",
      theme: { dark: "titanium" },
      skills: {
        customDirectories: ["skills/custom"],
        ignoredSkills: ["beta"],
        enabled: true,
        includeSkills: [],
      },
    });
  });
});
