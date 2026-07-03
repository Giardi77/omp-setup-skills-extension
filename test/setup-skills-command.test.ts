import { afterEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { YAML } from "bun";
import type { ExtensionAPI, ExtensionCommandContext } from "@oh-my-pi/pi-coding-agent";
import setupSkillsExtension from "../src/index";

const tempRoots: string[] = [];
const previousHomes: Array<string | undefined> = [];

type RegisteredCommand = {
  description?: string;
  handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
};

type Notification = {
  message: string;
  type?: "info" | "warning" | "error";
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function makeTempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "omp-setup-skills-command-"));
  tempRoots.push(root);
  return root;
}

async function makeTempProject(): Promise<string> {
  const root = await makeTempRoot();
  const fakeHome = path.join(root, "home");
  const project = path.join(root, "repo");

  previousHomes.push(process.env.HOME);
  process.env.HOME = fakeHome;

  await fs.mkdir(fakeHome, { recursive: true });
  await fs.mkdir(path.join(project, ".git"), { recursive: true });
  await fs.mkdir(path.join(project, ".omp", "skills", "alpha"), { recursive: true });
  await fs.mkdir(path.join(project, ".omp", "skills", "beta"), { recursive: true });
  await Bun.write(
    path.join(project, ".omp", "skills", "alpha", "SKILL.md"),
    "---\ndescription: Alpha project skill\n---\nUse alpha.\n",
  );
  await Bun.write(
    path.join(project, ".omp", "skills", "beta", "SKILL.md"),
    "---\ndescription: Beta project skill\n---\nUse beta.\n",
  );

  return project;
}

function isolatedSkillsConfig(): Record<string, unknown> {
  return {
    enableCodexUser: false,
    enableClaudeUser: false,
    enableClaudeProject: false,
    enablePiUser: false,
    enablePiProject: true,
    enableAgentsUser: false,
    enableAgentsProject: false,
  };
}

async function writeProjectConfig(project: string, config: Record<string, unknown>): Promise<string> {
  const configPath = path.join(project, ".omp", "config.yml");
  await Bun.write(configPath, YAML.stringify(config, null, 2));
  return configPath;
}

function registeredSetupSkillsCommand(): RegisteredCommand {
  const commands: Record<string, RegisteredCommand> = {};
  const labels: string[] = [];

  setupSkillsExtension({
    setLabel(label: string): void {
      labels.push(label);
    },
    registerCommand(name: string, options: RegisteredCommand): void {
      commands[name] = options;
    },
  } as unknown as ExtensionAPI);

  expect(labels).toEqual(["Setup Skills"]);
  const command = commands["setup-skills"];
  expect(command).toBeDefined();
  expect(command?.description).toBe("Select enabled skills for this project and reload the session");
  return command!;
}

type MockCommandContextOptions = {
  waitForIdle?: () => Promise<void>;
};

function mockCommandContext(
  cwd: string,
  selection: Set<string> | null,
  options: MockCommandContextOptions = {},
): {
  ctx: ExtensionCommandContext;
  notifications: Notification[];
  calls: {
    waitForIdle: number;
    custom: number;
    reload: number;
  };
} {
  const notifications: Notification[] = [];
  const calls = {
    waitForIdle: 0,
    custom: 0,
    reload: 0,
  };

  const ctx = {
    hasUI: true,
    cwd,
    waitForIdle: async () => {
      calls.waitForIdle += 1;
      await options.waitForIdle?.();
    },
    reload: async () => {
      calls.reload += 1;
    },
    ui: {
      custom: async <T>() => {
        calls.custom += 1;
        return selection as T;
      },
      notify: (message: string, type?: "info" | "warning" | "error") => {
        notifications.push({ message, type });
      },
    },
  } as unknown as ExtensionCommandContext;

  return { ctx, notifications, calls };
}

afterEach(async () => {
  while (previousHomes.length > 0) {
    const previousHome = previousHomes.pop();
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
  }
  await Promise.all(tempRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })));
});

describe("setup-skills command", () => {
  test("writes the confirmed project skill selection, waits for idle, and reloads the session", async () => {
    const project = await makeTempProject();
    const configPath = await writeProjectConfig(project, {
      model: "claude-sonnet",
      skills: isolatedSkillsConfig(),
    });
    const command = registeredSetupSkillsCommand();
    const { ctx, notifications, calls } = mockCommandContext(project, new Set(["alpha"]));

    await command.handler("", ctx);

    expect(calls).toEqual({ waitForIdle: 1, custom: 1, reload: 1 });
    const written = YAML.parse(await Bun.file(configPath).text()) as Record<string, unknown>;
    const writtenSkills = written.skills as Record<string, unknown>;
    expect(written.model).toBe("claude-sonnet");
    for (const [key, value] of Object.entries(isolatedSkillsConfig())) {
      expect(writtenSkills[key]).toBe(value);
    }
    expect(writtenSkills.enabled).toBe(true);
    expect(writtenSkills.includeSkills).toEqual([]);
    expect(Array.isArray(writtenSkills.ignoredSkills)).toBe(true);
    const ignoredSkills = writtenSkills.ignoredSkills as string[];
    expect(ignoredSkills).toContain("beta");
    expect(ignoredSkills).not.toContain("alpha");
    expect(notifications).toEqual([
      {
        message: `Updated ${configPath} (1 enabled, ${ignoredSkills.length} disabled). Reloading skills when the agent is idle...`,
        type: "info",
      },
    ]);
  });

  test("writes the config before waiting for an active turn to finish and reloads only after idle", async () => {
    const project = await makeTempProject();
    const configPath = await writeProjectConfig(project, {
      model: "claude-sonnet",
      skills: isolatedSkillsConfig(),
    });
    const command = registeredSetupSkillsCommand();
    const idle = deferred<void>();
    let markWaitStarted!: () => void;
    const waitStarted = new Promise<void>(resolve => {
      markWaitStarted = resolve;
    });
    const { ctx, calls } = mockCommandContext(project, new Set(["alpha"]), {
      waitForIdle: async () => {
        markWaitStarted();
        await idle.promise;
      },
    });
    const run = command.handler("", ctx);

    await waitStarted;

    let assertionError: unknown;
    try {
      expect(calls.custom).toBe(1);
      expect(calls.reload).toBe(0);
      const written = YAML.parse(await Bun.file(configPath).text()) as Record<string, unknown>;
      const writtenSkills = written.skills as Record<string, unknown>;
      expect(writtenSkills.enabled).toBe(true);
      expect(writtenSkills.includeSkills).toEqual([]);
      expect(writtenSkills.ignoredSkills).toContain("beta");
      expect(writtenSkills.ignoredSkills).not.toContain("alpha");
    } catch (error) {
      assertionError = error;
    } finally {
      idle.resolve();
      await run;
    }

    if (assertionError !== undefined) {
      throw assertionError;
    }
    expect(calls).toEqual({ waitForIdle: 1, custom: 1, reload: 1 });
  });

  test("leaves project config and session reload untouched when skill selection is cancelled", async () => {
    const project = await makeTempProject();
    const configPath = path.join(project, ".omp", "config.yml");
    const originalConfig = YAML.stringify(
      {
        model: "claude-sonnet",
        skills: isolatedSkillsConfig(),
      },
      null,
      2,
    );
    await Bun.write(configPath, originalConfig);
    const command = registeredSetupSkillsCommand();
    const { ctx, notifications, calls } = mockCommandContext(project, null);

    await command.handler("", ctx);

    expect(calls).toEqual({ waitForIdle: 0, custom: 1, reload: 0 });
    expect(notifications).toEqual([{ message: "Project skills unchanged.", type: "info" }]);
    expect(await Bun.file(configPath).text()).toBe(originalConfig);
  });
});
