# Security Policy

## Supported versions

Only the latest published version gets fixes. There are no maintenance branches; upgrading is the fix.

| Version | Supported |
|---|---|
| 0.1.x (latest) | Yes |
| anything older | No |

## Reporting a vulnerability

Use GitHub's private advisory form:

**https://github.com/Chemiofitor4096/minecraft-dev-starter/security/advisories/new**

Please do not open a public issue for anything that could be exploited before a fix ships. If the
form is unavailable, open an issue containing only the sentence "security report — please provide a
private channel" and nothing else.

Useful in a report:

- the plugin version (the `host ready (x.y.z)` line in the DSH host log, or the version on npm)
- the host version (DSH NEXT / `dsh --version`), OS and Node version
- what you did, what happened, and the relevant log lines
- the smallest project shape that reproduces it (loader, Minecraft version, single or multi-module)

Redact home directory paths and anything that looks like a token before pasting logs.

**What to expect:** acknowledgement within 72 hours; for a confirmed issue, a fix or a mitigation
plan within 14 days, and credit in the release notes unless you prefer otherwise. This is a
single-maintainer project — those are targets, not an SLA.

## Scope

In scope:

- the `/mcdev/api` HTTP surface: authentication bypass, cross-site requests, path traversal
- the launch service: spawning processes outside the workspace, leaving orphan processes, writing
  outside `~/.dsh/mc-dev-starter`
- the client bundle: script injection through project names, paths or log lines rendered in the panel
- packaging: anything that runs on a user's machine at install time, or files that should not be in
  the tarball

Out of scope, by design:

- **Running the workspace's own Gradle wrapper.** Launching a target executes `gradlew` from the
  project directory with the user's environment. That is the same trust you extend by running
  `gradle` there yourself; a malicious build script is a workspace problem, not a plugin
  vulnerability. The plugin only offers targets it discovered in the workspace and never executes
  arbitrary commands on its own.
- **Host runtime and its dependencies.** Report those upstream to DeepSeek Harness. The `zod`
  advisory shown on the npm page arrives through `@deepseek-ai/dsh-tools`; this package declares no
  dependencies and cannot pin it.
- **The `eval` finding on the npm page.** False positive: it matches a string literal in
  `@deepseek-ai/dsh-ptc-runtime`'s reserved-word table. `eval` does not appear in this repository or
  in the built bundle.

## What the plugin does with your machine

- Writes run state and logs under `~/.dsh/mc-dev-starter/profiles/<name>/`, and the JDK preference to
  `jdk.json` in the same tree.
- Never writes into the project beyond what Gradle itself writes, and never runs `clean` implicitly.
- Makes no network requests of its own; only Gradle's dependency resolution reaches the network.
- Sends nothing to third parties. The client bundle posts diagnostics to the local `/mcdev/api`
  routes, which sit behind the host's own authentication.
- At most one target per project; stopping kills the whole process tree (Windows `taskkill /T`,
  POSIX process group) so no orphan `java` process survives.
