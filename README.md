# Giardi OMP Plugins

This repository is an OMP plugin marketplace.

It currently includes `omp-setup-skills-extension`, which adds one OMP command:

```text
/setup-skills
```

The command opens a small checkbox menu for the current project so you can enable or disable discovered OMP skills without editing YAML by hand.

## Install in OMP

If you previously installed this plugin directly from GitHub, remove that install first to avoid loading the same command twice:

```bash
omp plugin uninstall omp-setup-skills-extension
```

Add this repository as an OMP marketplace:

```bash
omp plugin marketplace add Giardi77/omp-plugins
```

Verify that OMP can see the marketplace and its plugins:

```bash
omp plugin marketplace list
omp plugin discover giardi-plugins
```

Install the setup-skills plugin from the marketplace:

```bash
omp plugin install omp-setup-skills-extension@giardi-plugins
```

If OMP is already running, restart it after installing so the extension is loaded.

For future releases, refresh the cached marketplace catalog before upgrading:

```bash
omp plugin marketplace update giardi-plugins
omp plugin upgrade
```

Alternative direct Git install, without marketplace upgrade support:

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
