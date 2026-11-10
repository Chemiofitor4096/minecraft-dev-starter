# Changelog

User-visible changes only. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
versions follow [Semantic Versioning](https://semver.org/).

The host is still pre-1.0, so **raising the supported DSH range counts as a breaking change** — the
plugin rides on host slots, the module loader and `@deepseek-ai/dsh-tools`, and a change there can
break installations that look unrelated.

## [0.2.0] — 2026-11-10

### Added

- `mc_mod_init` scaffolds a new Fabric project into an empty directory: it resolves the loader, yarn, loom
  and Fabric API versions from upstream at call time, renders the bundled template into the target, and
  refuses a non-empty directory. The result builds with `gradlew build` and is detected by `mc_projects`
  without warnings (Gradle 9.8.1, loom 1.10.5, Java 21).

### Changed

- Tool descriptions are English and one or two sentences. The parameter list and the return shape live in
  the schema, so a description now only says what the tool is for and the single constraint that is easy
  to get wrong. Tool *results* stay in the interface language.
- `mc_projects` marks a task path inferred by loader convention as `(guessed)` instead of a localized word,
  so the same marker appears whatever the UI language is.

### Internal

- Version selection happens at call time: `src/lib/versions.js` asks Fabric meta / NeoForge maven for the
  exact versions of a `(loader, MC version)` pair and falls back to a small seed. `data/versions.json`
  keeps only that seed and the list of combinations that were actually run.
- Source tree regrouped by domain — `detect` / `launch` / `i18n` / `util` on the host side, `views` / `lib`
  on the client side. Build scripts live in `scripts/`, development helpers in `tools/`.
- loom is pinned per Java line instead of "latest": loom 1.19 requires a Java 25 runtime, while Minecraft
  1.20 / 1.21 mods target Java 17 / 21, so those lines pin loom 1.10.5.

## [0.1.13] — 2026-11-06

### Added

- Each declared dependency is compared with the version from the IDE's Gradle-synced library table,
  without running Gradle: an equal version shows nothing, a different one shows `actual x.y.z` in an
  advisory tone, and a declaration the table does not know shows `unresolved`. The section header
  carries the sync time, because that table only reflects the last sync. Projects without a synced
  `.idea` keep the plain declaration list, unchanged.
- The panel, the flyout, the capsule and the log tab follow the DSH language setting: client strings,
  host-side evidence / warning / crash-cause texts and relative times are translated, and switching
  the language updates an open panel immediately. Loader names, project paths and Gradle task paths
  are not translated.
- The "last run" line reports how long a daemon actually ran (`ran 1m 27s`) instead of the
  uninformative `exited`; one-shot targets still report their verdict.

### Changed

- An empty dependency section is collapsed instead of taking a whole screen.
- The flyout keeps submodules of a composite build next to their parent project and labels them with
  the parent directory name; duplicate titles are disambiguated across the whole list, so the same
  project is not suffixed in one group and bare in another.

### Fixed

- Switching the DSH language left the panel in the previous language until something else re-rendered
  it; the four surfaces now subscribe to the locale service.
- Submodule task paths used `/` where Gradle expects the colon hierarchy
  (`:modules:core:runClient`), which made every module of a composite build unlaunchable. Reported by
  mmyddd (PR #2).

## [0.1.12] — 2026-11-05

### Added

- The IDE project model reports the Minecraft version written into the module files
  (`McpModuleSettings`). It is used only when the build script yields no version, and is marked as
  independent evidence rather than a correction.
- The library table from IntelliJ's external storage: with
  `ExternalStorageConfigurationManager enabled="true"` there is no `.idea/libraries`, so the
  Gradle-synced `libraries.xml` under `%LOCALAPPDATA%\JetBrains\…\projects\<name>.<hash>\` is located
  through the `cache-state.xml` project-path match. The summary reports how many entries exist and how
  many are project-local remap products (loom caches, absent from `~/.gradle`). A project whose path
  does not match is never given another project's table.

### Changed

- The Mod Dev panel is organised around "can it run": header chips for loader / version / kind, a
  status strip (state, Gradle wrapper, JDK), one target picker next to the start button, and the last
  run's verdict directly under it. The IDE model, the module table and the confidence score moved
  into a collapsible "诊断" section — they explain a conclusion, they should not fill the screen.
- The project flyout groups entries by runnable / other (collapsed), offers a filter once there are
  more than eight projects, and appends the directory name when two projects share a title.

### Fixed

- A mod name that is still an unresolved Gradle placeholder (`${mod_name}`) is displayed as the
  directory name instead of the raw placeholder.

## [0.1.11] — 2026-11-04

### Added

- IntelliJ `.idea` as a second evidence source: Gradle module list, minecraft facet platform,
  project JDK, language level and the run configurations that exist in the IDE. Build scripts stay
  authoritative — `.idea` only fills gaps and never overrides a judged loader.
- Submodule projects: each module of an aggregator build is listed as its own project, its run
  targets carry the Gradle module prefix (`:modules/core:runClient`) and launch from the aggregator
  root, where the wrapper lives. `mc_project_detail` reports `gradleRoot` and `modulePath`.
- Per-target `source` in `mc_project_detail` (`build-script` / `idea-run-config` / `guessed`), and an
  `idea` block describing the IDE model. The panel shows the same in a collapsible section, marks
  IDE-derived targets with `✓` and lists modules by Gradle path.

### Changed

- An aggregator root is no longer listed as a project when its submodules are: its targets
  duplicated theirs.
- `.idea` summaries for a submodule count only that module's run configurations.
- Multi-module discovery does not require IntelliJ: `settings.gradle` includes are the primary module
  source and `.idea` only adds modules the build file does not declare.

### Fixed

- Submodule projects were listed with unqualified task names and launched from the module directory,
  where there is no Gradle wrapper — the launch could never start.
- `legacyforge` projects were judged NeoForge by organisation name.
- Reading a `.idea` without `misc.xml` threw instead of degrading.
- Module files (`.iml`) referenced from a cloned repository are only read when they live inside the
  project directory.
- `package-lock.json` still declared version 0.1.3.

## [0.1.10] — 2026-11-03

### Added

- Declared dependencies view: `dependencies { }` blocks, `gradle/libs.versions.toml` (inline tables
  and `version.ref`) and mod metadata `depends`, each with `file:line`, deduplicated per module.
- `mc_project_detail` reports the same dependency list.
- `README.zh_CN.md`; the npm package ships both languages.

### Changed

- `README.md` is English by default.
- Project panel rebuilt: header with loader / version / kind / path, collapsible dependency and
  evidence sections, every explanation moved into a tooltip.
- Sidebar tabs render an icon + label title chip through `sidebar.right.pane.tab.title`.

### Fixed

- Dependency rows no longer repeat per configuration and no longer overflow the panel.

## [0.1.9] — 2026-11-02

### Fixed

- The session header capsule no longer appears in workspaces without a runnable Minecraft project
  (library modules that only declare a loader no longer count).
- Default selection prefers the first project that actually has run targets.

## [0.1.8] — 2026-11-01

### Added

- Per-project JDK selection: pick an installed JDK or add one by path; the choice is injected as
  `-Dorg.gradle.java.home` and `JAVA_HOME`. Auto-selection only takes over on an exact major match
  whose Gradle can run that JVM.

### Changed

- Run state and logs are stored per profile (`~/.dsh/mc-dev-starter/profiles/<name>/`); pre-split
  state is moved in once on first start.

### Fixed

- `runs { configureEach { … } }` no longer produces a bogus `runConfigureEach` target.
- Scope narrowed to Gradle projects.

## [0.1.7] — 2026-10-31

### Added

- Run targets carry a lifecycle: `daemon` (client/server) and `oneshot` (data, datagen, game test).
  One-shot runs end with a `verdict` (`passed` / `failed` / `aborted` / `error` / `unknown`).
- `mc_launch` waits for readiness on daemons and for exit on one-shot tasks; `wait: exit` is honoured
  for both, and `mc_project_detail` / `mc_launch_list` / `mc_launch_logs` expose the verdict.

## [0.1.6] — 2026-10-31

### Added

- Log level filtering, six model tools, structured crash attribution.
- `mc_launch` default timeout of 10 minutes.

### Changed

- With `dsh-better-sidebar` installed, logs default to its bottom workbench.

## [0.1.5] — 2026-10-31

### Added

- `logDock`: send logs to the native right sidebar or to better-sidebar's bottom workbench.

## [0.1.4] — 2026-10-31

### Added

- Log lines coloured by level.

## [0.1.3] — 2026-10-31

### Changed

- Peer dependency ranges, repository metadata, screenshots and README rewritten.

## [0.1.2] — 2026-10-31

### Fixed

- Installing 0.1.1 while the host reported 0.1.0: the version is now read from `package.json` at
  startup.

## [0.1.1] — 2026-10-31

### Fixed

- Minimal profiles (no web layer) failed to load the plugin tree; `webServer` is now an optional
  injection instead of a required one.

## [0.1.0] — 2026-10-31

### Added

- First release: detect Fabric / Forge / NeoForge / Architectury / Paper projects, launch
  `runClient` / `runServer` from the session header capsule, logs in a sidebar tab, four model
  tools.
