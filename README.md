# OMP Setup Skills Extension

Adds one OMP command:

```text
/setup-skills
```

It opens a small checkbox menu for the current project so you can enable or disable discovered OMP skills without editing YAML by hand.

## Install

Install from GitHub with the standard OMP plugin command:

```bash
omp plugin install https://github.com/Giardi77/omp-setup-skills-extension.git
```

If OMP is already running, restart it after installing so the extension is loaded.

## Local development install

For this checkout:

```bash
omp plugin link /Users/giardi/projects/omp-setup-skills-extension
```

For another clone/path:

```bash
omp plugin link /path/to/omp-setup-skills-extension
```

Then restart OMP.

## Use

Open OMP inside a project and run:

```text
/setup-skills
```

Keys:

```text
↑/↓ or j/k  move
Space       toggle selected skill
a           enable all
n           disable all
Enter       save and reload skills
Esc         cancel
```

## What it changes

On save, the extension writes the project config file:

```text
<repo>/.omp/config.yml
```

It updates only the `skills` section:

- default mode uses `skills.ignoredSkills` to disable unchecked skills
- existing allowlist mode uses `skills.includeSkills` to keep only checked skills

After saving, it reloads the current OMP session so the selected skills are active immediately.

## Uninstall

```bash
omp plugin uninstall omp-setup-skills-extension
```
