import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { YAML } from "bun";
import { loadSkills, type LoadSkillsOptions, type Skill } from "@oh-my-pi/pi-coding-agent/extensibility/skills";

export interface ProjectSkillsConfig {
  enabled?: boolean;
  enableSkillCommands?: boolean;
  enableCodexUser?: boolean;
  enableClaudeUser?: boolean;
  enableClaudeProject?: boolean;
  enablePiUser?: boolean;
  enablePiProject?: boolean;
  customDirectories?: string[];
  ignoredSkills?: string[];
  includeSkills?: string[];
  disabledExtensions?: string[];
  [key: string]: unknown;
}

export interface ProjectSkillRow {
  name: string;
  description: string;
  filePath: string;
  source: string;
  enabled: boolean;
}

export interface ProjectSkillsState {
  projectRoot: string;
  configPath: string;
  config: RawConfig;
  skills: ProjectSkillsConfig;
  includeMode: boolean;
  rows: ProjectSkillRow[];
  warnings: string[];
}

type RawConfig = Record<string, unknown>;
type SkillLoader = (options: LoadSkillsOptions) => Promise<{ skills: Skill[]; warnings: Array<{ skillPath?: string; message: string }> }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function existsAsDirectory(dir: string): Promise<boolean> {
  try {
    return (await fs.stat(dir)).isDirectory();
  } catch {
    return false;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function resolveProjectSkillsRoot(cwd: string): Promise<string> {
  const start = path.resolve(cwd);
  const home = path.resolve(os.homedir());

  let dir = start;
  while (true) {
    if (dir !== home && (await existsAsDirectory(path.join(dir, ".omp")))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir || dir === home) break;
    dir = parent;
  }

  dir = start;
  while (true) {
    if (dir !== home && (await exists(path.join(dir, ".git")))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir || dir === home) break;
    dir = parent;
  }

  if (start === home) {
    throw new Error("No project context found. Run /setup-skills from inside a repository or project directory.");
  }

  return start;
}

async function readProjectConfig(configPath: string): Promise<RawConfig> {
  let content: string;
  try {
    content = await Bun.file(configPath).text();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }

  let parsed: unknown;
  try {
    parsed = YAML.parse(content);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse ${configPath}: ${message}`);
  }

  if (parsed === undefined || parsed === null) return {};
  if (!isRecord(parsed)) {
    throw new Error(`${configPath} must contain a YAML object`);
  }
  return parsed;
}

function asStringArray(value: unknown, key: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    throw new Error(`skills.${key} must be an array of strings in project config`);
  }
  return [...value];
}

export function readSkillsSection(config: RawConfig): ProjectSkillsConfig {
  const rawSkills = config.skills;
  if (rawSkills === undefined) return {};
  if (!isRecord(rawSkills)) {
    throw new Error("skills must be an object in project config");
  }

  return {
    ...rawSkills,
    customDirectories: asStringArray(rawSkills.customDirectories, "customDirectories"),
    ignoredSkills: asStringArray(rawSkills.ignoredSkills, "ignoredSkills"),
    includeSkills: asStringArray(rawSkills.includeSkills, "includeSkills"),
    disabledExtensions: asStringArray(rawSkills.disabledExtensions, "disabledExtensions"),
  };
}

function matchesAnyGlob(patterns: readonly string[], value: string): boolean {
  for (const pattern of patterns) {
    try {
      if (new Bun.Glob(pattern).match(value)) return true;
    } catch {
      if (pattern === value) return true;
    }
  }
  return false;
}

export function isSkillEnabledByProjectConfig(name: string, skills: ProjectSkillsConfig): boolean {
  if (skills.enabled === false) return false;

  const ignored = skills.ignoredSkills ?? [];
  if (matchesAnyGlob(ignored, name)) return false;

  const included = skills.includeSkills ?? [];
  return included.length === 0 || matchesAnyGlob(included, name);
}

function discoveryOptionsFromProjectSkills(skills: ProjectSkillsConfig): LoadSkillsOptions {
  return {
    ...skills,
    // The selector must show skills that are currently disabled by project filters,
    // otherwise the user cannot re-enable them from the menu.
    enabled: true,
    ignoredSkills: [],
    includeSkills: [],
    disabledExtensions: [],
  };
}

function toRows(skills: readonly Skill[], projectSkills: ProjectSkillsConfig): ProjectSkillRow[] {
  return skills.map(skill => ({
    name: skill.name,
    description: skill.description,
    filePath: skill.filePath,
    source: skill.source,
    enabled: isSkillEnabledByProjectConfig(skill.name, projectSkills),
  }));
}

export async function loadProjectSkillsState(
  cwd: string,
  skillLoader: SkillLoader = loadSkills,
): Promise<ProjectSkillsState> {
  const projectRoot = await resolveProjectSkillsRoot(cwd);
  const configPath = path.join(projectRoot, ".omp", "config.yml");
  const config = await readProjectConfig(configPath);
  const skills = readSkillsSection(config);
  const includeMode = (skills.includeSkills ?? []).length > 0;
  const discovery = await skillLoader({
    ...discoveryOptionsFromProjectSkills(skills),
    cwd: projectRoot,
  });

  return {
    projectRoot,
    configPath,
    config,
    skills,
    includeMode,
    rows: toRows(discovery.skills, skills),
    warnings: discovery.warnings.map(warning => `${warning.skillPath ? `${warning.skillPath}: ` : ""}${warning.message}`),
  };
}

export function buildUpdatedSkillsSection(
  current: ProjectSkillsConfig,
  rows: readonly Pick<ProjectSkillRow, "name">[],
  selectedNames: ReadonlySet<string>,
  includeMode: boolean,
): ProjectSkillsConfig {
  const knownNames = rows.map(row => row.name).sort((a, b) => a.localeCompare(b));
  const selectedKnownNames = knownNames.filter(name => selectedNames.has(name));
  const disabledKnownNames = knownNames.filter(name => !selectedNames.has(name));
  const next: ProjectSkillsConfig = { ...current };

  if (selectedKnownNames.length === 0) {
    next.enabled = false;
    next.includeSkills = [];
    next.ignoredSkills = [];
    return next;
  }

  next.enabled = true;
  if (includeMode) {
    // Preserve allowlist semantics for projects already using includeSkills.
    next.includeSkills = selectedKnownNames;
    next.ignoredSkills = [];
  } else {
    // Default project behavior remains blocklist mode so newly added skills are
    // enabled unless the user explicitly disables them here.
    next.includeSkills = [];
    next.ignoredSkills = disabledKnownNames;
  }
  return next;
}

export async function writeProjectSkillsSelection(
  state: Pick<ProjectSkillsState, "config" | "configPath" | "includeMode" | "rows" | "skills">,
  selectedNames: ReadonlySet<string>,
): Promise<ProjectSkillsConfig> {
  const config: RawConfig = { ...state.config };
  const nextSkills = buildUpdatedSkillsSection(state.skills, state.rows, selectedNames, state.includeMode);
  config.skills = nextSkills;

  await fs.mkdir(path.dirname(state.configPath), { recursive: true });
  await Bun.write(state.configPath, YAML.stringify(config, null, 2));
  return nextSkills;
}
