# Giardi OMP Plugins

This repository is an OMP plugin marketplace.

It currently includes `omp-setup-skills-extension`, which adds one OMP command:

```text
/setup-skills
```

The command opens a small checkbox menu for the current project so you can enable or disable discovered OMP skills without editing YAML by hand.

## Install from the marketplace

Add the marketplace, then install the setup-skills plugin:

```bash
omp plugin marketplace add Giardi77/omp-plugins
omp plugin install omp-setup-skills-extension@giardi-plugins
```

If OMP is already running, restart it after installing so the extension is loaded.

For direct Git installs without the marketplace:

```bash
omp plugin install https://github.com/Giardi77/omp-plugins.git
```

## Local development install

For a local checkout:

```bash
omp plugin link /path/to/omp-plugins
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
Enter       save and reload skills when the agent is idle
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

After saving, it reloads the current OMP session when the agent is idle so the selected skills become active without blocking mid-turn selection.

## Uninstall

Marketplace install:

```bash
omp plugin uninstall omp-setup-skills-extension@giardi-plugins
```

Direct Git/local install:

```bash
omp plugin uninstall omp-setup-skills-extension
```
