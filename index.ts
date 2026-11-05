import { Plugin } from "@opencode/plugin"
import { SkillGroups } from "./rpc"
import type { StoreData } from "./types"

let cache: StoreData = { groups: {}, repos: {} }

function normalizeConfig(input: unknown): StoreData {
  const cfg = (input ?? {}) as Partial<StoreData>
  return {
    groups: cfg.groups && typeof cfg.groups === "object" ? (cfg.groups as StoreData["groups"]) : {},
    repos: cfg.repos && typeof cfg.repos === "object" ? (cfg.repos as StoreData["repos"]) : {},
  }
}

async function loadConfig(ctx: any): Promise<StoreData> {
  const stored = await ctx.storage.get("config")
  cache = normalizeConfig(stored)
  return cache
}

async function reloadConfig(ctx: any): Promise<StoreData> {
  try {
    const stored = await ctx.storage.get("config")
    cache = normalizeConfig(stored)
  } catch {
    // keep current cache on failure
  }
  return cache
}

function repoKey(ctx: any): string {
  return ctx.location.project?.id ?? ctx.location.directory
}

function toSkillArray(output: any): any[] {
  if (Array.isArray(output)) return output
  if (Array.isArray(output?.data)) return output.data
  if (Array.isArray(output?.skills)) return output.skills
  return []
}

export default Plugin.define({
  id: "skill-groups",
  async setup(ctx: any) {
    await loadConfig(ctx)

    let registration: any

    const applyTransform = async () => {
      if (registration) return registration
      registration = await ctx.skill.transform((editor: any) => {
        const config = cache
        const key = repoKey(ctx)
        const repo = config.repos[key]
        const hasSelection =
          !!repo && ((repo.groups?.length ?? 0) > 0 || (repo.skills?.length ?? 0) > 0)

        if (!hasSelection) return

        const allowed = new Set<string>()
        for (const groupId of repo.groups ?? []) {
          const group = config.groups[groupId]
          if (group?.skills) {
            for (const skillId of group.skills) allowed.add(skillId)
          }
        }
        for (const skillId of repo.skills ?? []) allowed.add(skillId)

        for (const skill of editor.list()) {
          if (!allowed.has(skill.id)) editor.remove(skill.id)
        }
      })
      await ctx.skill.reload()
      return registration
    }

    // Wait for skill sources to load, then register the transform.
    void (async () => {
      for (let i = 0; i < 30; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500))
        try {
          const out = await ctx.skill.list()
          const arr = toSkillArray(out)
          if (arr.length > 2) break
        } catch {
          // ignore
        }
      }
      try {
        await applyTransform()
      } catch (error) {
        console.warn("skill-groups: transform registration failed:", error)
      }
    })()

    let rpcRegistration: any
    try {
      rpcRegistration = await ctx.rpc.register(SkillGroups, {
        getConfig: async () => {
          await reloadConfig(ctx)
          return cache
        },
        saveConfig: async (input: unknown) => {
          cache = normalizeConfig(input)
          await ctx.storage.set("config", cache)
          await ctx.skill.reload()
          try {
            await rpcRegistration?.events?.emit?.("updated", {})
          } catch {
            // ignore emit errors
          }
          return cache
        },
      })
    } catch (error) {
      console.warn("skill-groups: RPC registration skipped:", error)
    }

    let unsubscribe: (() => void) | undefined
    try {
      const rpc = ctx.rpc(SkillGroups)
      unsubscribe = rpc.events.on("updated", () => {
        void (async () => {
          await reloadConfig(ctx)
          await ctx.skill.reload()
        })()
      })
    } catch (error) {
      console.warn("skill-groups: event subscription skipped:", error)
    }

    const controller = new AbortController()
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          if (String(event?.type ?? "").toLowerCase().includes("skill")) {
            await ctx.skill.reload()
          }
        }
      } catch {
        // ignore
      }
    })()

    return () => {
      controller.abort()
      try {
        unsubscribe?.()
      } catch {}
      try {
        void registration?.dispose?.()
      } catch {}
      try {
        void rpcRegistration?.dispose?.()
      } catch {}
    }
  },
})