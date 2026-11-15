import { defineTool } from '@deepseek-ai/dsh-tools'
import { modeOf } from '../lib/launch/verify.js'
import { rootArgs } from './shared.js'
import { renderTargets, ideaText, javaSourceText } from './render.js'

/**
 * `mc_project_detail` 的定义。
 * @param {Record<string, any>} api
 */
export function mcProjectDetailTool(api) {
  return defineTool({

    name: 'mc_project_detail',
    description: `Profile one project: loader evidence, targets with mode and source, JDK, dependencies, warnings. Read-only; check it before launching, and never run a guessed target without confirming it.`,
    parameters: {
      root: { type: 'string', description: 'Project directory; defaults to the session workspace' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          root: { type: 'string', required: true },
          name: { type: 'string', required: true },
          loader: { type: 'string', required: true },
          loaders: { type: 'array', items: { type: 'string' } },
          minecraftVersion: { type: 'string' },
          kind: { type: 'string', required: true },
          confidence: { type: 'number', required: true },
          modules: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                path: { type: 'string', required: true },
                platform: { type: 'string', required: true },
                targets: { type: 'array', required: true, items: { type: 'string' } },
              },
            },
          },
          gradleRoot: { type: 'string', description: 'Directory where Gradle actually runs; for a subproject this is its aggregator root' },
          modulePath: { type: 'string', description: 'Module path of this subproject inside the aggregator root' },
          targets: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                taskPath: { type: 'string', required: true },
                label: { type: 'string', required: true },
                mode: { type: 'string', required: true, enum: ['daemon', 'oneshot'] },
                guessed: { type: 'boolean', required: true },
                source: {
                  type: 'string',
                  enum: ['build-script', 'idea-run-config', 'guessed'],
                  description: 'Where the target came from: a runs block in the build script, a configuration run in the IDE, or a loader convention (guessed)',
                },
              },
            },
          },
          idea: {
            type: 'object',
            additionalProperties: false,
            description: 'IntelliJ IDEA project model read from .idea; absent when there is no .idea',
            properties: {
              name: { type: 'string', required: true },
              dir: { type: 'string', required: true },
              gradleRoot: { type: 'string' },
              gradleJvm: { type: 'string' },
              jdkName: { type: 'string' },
              minecraftVersion: { type: 'string', description: 'Minecraft version written into the iml by the MC Development plugin; corroborating evidence only' },
              languageLevel: { type: 'integer' },
              bytecodeTarget: { type: 'integer' },
              modules: { type: 'integer', description: 'Number of Gradle-linked modules, including the root' },
              imls: { type: 'integer', description: 'Number of iml module files' },
              runConfigurations: { type: 'integer', description: 'Number of run configurations in the IDE' },
              platforms: { type: 'array', items: { type: 'string' }, description: 'Union of platformType values from minecraft facets in the iml files' },
              linkedProjects: { type: 'array', items: { type: 'string' }, description: 'Other Gradle projects linked into this composite build' },
              libraries: {
                type: 'object',
                additionalProperties: false,
                description: 'Library table from the Gradle sync (.idea/libraries or the IDE external storage)',
                properties: {
                  storage: { type: 'string', enum: ['project', 'external'], required: true },
                  count: { type: 'integer', required: true },
                  local: { type: 'integer', required: true, description: 'Entries pointing at in-project remap artifacts' },
                },
              },
            },
          },
          java: {
            type: 'object',
            additionalProperties: false,
            properties: {
              required: { type: 'number' },
              selected: { type: 'string' },
              exact: { type: 'boolean' },
              source: { type: 'string', enum: ['override', 'configured', 'auto', 'none'] },
              override: { type: 'string' },
              available: { type: 'array', items: { type: 'number' } },
            },
          },
          dependencies: {
            type: 'object',
            additionalProperties: false,
            properties: {
              catalogFile: { type: 'string' },
              build: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    configuration: { type: 'string', required: true },
                    notation: { type: 'string', required: true },
                    file: { type: 'string', required: true },
                    line: { type: 'integer', required: true },
                    catalogRef: { type: 'string' },
                  },
                },
              },
              mods: {
                type: 'array',
                required: true,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    modId: { type: 'string', required: true },
                    range: { type: 'string', required: true },
                  },
                },
              },
            },
          },
          evidence: { type: 'array', required: true, items: { type: 'string' } },
          warnings: { type: 'array', required: true, items: { type: 'string' } },
          conflicts: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [
        {
          type: 'text',
          text:
            `${value.name} · ${value.loader}${value.minecraftVersion === undefined ? '' : ` ${value.minecraftVersion}`} · 置信度 ${Math.round(value.confidence * 100)}%`
            + `\n模块：${value.modules.map((module) => `${module.path}(${module.platform})`).join('、')}`
            + (value.targets === undefined ? '' : `\n目标：${renderTargets(value.targets)}`)
            + `\nJDK：需要 ${value.java?.required ?? '?'}，选中 ${value.java?.selected ?? '无'}${javaSourceText(value.java?.source)}`
            + (value.idea === undefined ? '' : `\nIDE：${ideaText(value.idea)}`)
            + (value.dependencies === undefined
              ? ''
              : `\n依赖：构建 ${value.dependencies.build.length} 条、模组声明 ${value.dependencies.mods.length} 条`)
            + (value.warnings.length === 0 ? '' : `\n警告：${value.warnings.join('；')}`),
        },
      ],
    },
    async execute(args, exec) {
      // 只把"我在哪个会话、想要哪个目录"交上去：解析交给 api.resolveRoot
      const profile = await api['projects.detail']({ ...rootArgs(args, exec) })
      /** @type {Record<string, any>} */
      const value = {
        root: profile.root,
        name: profile.modName ?? profile.name,
        loader: profile.loader,
        kind: profile.kind,
        confidence: profile.confidence,
        modules: (profile.modules ?? []).map((module) => ({
          path: module.gradlePath ?? module.path,
          platform: module.platform,
          targets: (module.targets ?? []).map((target) => target.taskPath),
        })),
        evidence: (profile.evidence ?? []).map((entry) => `${entry.file} — ${entry.detail}`),
        warnings: profile.warnings ?? [],
        conflicts: profile.conflicts ?? [],
      }
      if (Array.isArray(profile.loaders) && profile.loaders.length > 0) value.loaders = profile.loaders
      const runTargets = (profile.runTargets ?? []).map((target) => ({
        taskPath: target.taskPath,
        label: target.label ?? target.taskPath,
        mode: target.mode ?? modeOf(target.kind),
        guessed: target.guessed === true,
        ...(target.source === undefined ? {} : { source: target.source }),
      }))
      if (runTargets.length > 0) value.targets = runTargets
      if (profile.idea !== undefined && profile.idea !== null) {
        const idea = /** @type {Record<string, any>} */ (profile.idea)
        /** @type {Record<string, any>} */
        const compact = { name: String(idea.name ?? ''), dir: String(idea.dir ?? '') }
        for (const key of ['gradleRoot', 'gradleJvm', 'jdkName', 'minecraftVersion']) {
          if (typeof idea[key] === 'string' && idea[key] !== '') compact[key] = idea[key]
        }
        for (const key of ['languageLevel', 'bytecodeTarget', 'modules', 'imls', 'runConfigurations']) {
          if (typeof idea[key] === 'number') compact[key] = idea[key]
        }
        if (Array.isArray(idea.platforms) && idea.platforms.length > 0) compact.platforms = idea.platforms
        if (Array.isArray(idea.linkedProjects) && idea.linkedProjects.length > 0) compact.linkedProjects = idea.linkedProjects
        if (idea.libraries !== null && typeof idea.libraries === 'object') {
          compact.libraries = {
            storage: idea.libraries.storage,
            count: idea.libraries.count,
            local: idea.libraries.local,
          }
        }
        value.idea = compact
      }
      if (profile.minecraftVersion !== undefined && profile.minecraftVersion !== '') value.minecraftVersion = profile.minecraftVersion
      if (typeof profile.gradleRoot === 'string' && profile.gradleRoot !== profile.root) value.gradleRoot = profile.gradleRoot
      if (typeof profile.modulePath === 'string' && profile.modulePath !== '') value.modulePath = profile.modulePath
      if (profile.java !== undefined) {
        value.java = { required: profile.java.required, exact: profile.java.exact === true }
        if (profile.java.selected !== undefined) value.java.selected = profile.java.selected
        if (profile.java.source !== undefined) value.java.source = profile.java.source
        if (profile.java.override !== undefined) value.java.override = profile.java.override
        value.java.available = (profile.java.available ?? []).map((jdk) => jdk.major)
      }
      if (profile.dependencies !== undefined) {
        const decl = /** @type {Record<string, any>} */ (profile.dependencies)
        /** @type {{ build: Array<Record<string, any>>, mods: Array<Record<string, any>>, catalogFile?: string }} */
        const dependencies = { build: [], mods: [] }
        for (const entry of (decl.build ?? []).slice(0, 60)) {
          /** @type {Record<string, any>} */
          const item = {
            configuration: entry.configuration,
            notation: entry.notation,
            file: entry.file,
            line: entry.line,
          }
          if (entry.catalogRef !== undefined) item.catalogRef = entry.catalogRef
          dependencies.build.push(item)
        }
        for (const entry of (decl.mods ?? []).slice(0, 30)) {
          dependencies.mods.push({ modId: entry.modId, range: entry.range })
        }
        if (typeof decl.catalogFile === 'string' && decl.catalogFile !== '') dependencies.catalogFile = decl.catalogFile
        value.dependencies = dependencies
      }
      return value
    },
  })
}
