import { Plugin } from "@opencode/plugin/tui"
import { SkillGroups } from "./rpc"
import type { StoreData, RepoConfig } from "./types"

function normalizeConfig(input: unknown): StoreData {
  const cfg = (input ?? {}) as Partial<StoreData>
  return {
    groups: cfg.groups && typeof cfg.groups === "object" ? (cfg.groups as StoreData["groups"]) : {},
    repos: cfg.repos && typeof cfg.repos === "object" ? (cfg.repos as StoreData["repos"]) : {},
  }
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return base || "group"
}

function uniqueGroupId(config: StoreData, base: string): string {
  let id = base
  let i = 2
  while (config.groups[id]) {
    id = `${base}-${i++}`
  }
  return id
}

export default Plugin.define({
  id: "skill-groups",
  async setup(context: any) {
    const rpc = context.client.rpc(SkillGroups)
    const rpcLocation = () => context.location ?? context.data.location.default()
    try { (globalThis as any).__sg_debug = { location: rpcLocation(), dataLocation: context.data?.location, contextLocation: context.location } } catch {}
    try { require("node:fs").writeFileSync("/tmp/opencode/sg_loc.txt", JSON.stringify({ location: rpcLocation(), contextLocation: context.location, hasDataLocation: !!context.data?.location }, null, 2)) } catch (e) { try { require("node:fs").writeFileSync("/tmp/opencode/sg_loc.txt", String(e)) } catch {} }

    const getConfig = async (): Promise<StoreData> => {
      try {
        const res = await rpc.getConfig({}, { location: rpcLocation() })
        try { require("node:fs").writeFileSync("/tmp/opencode/sg_getconfig.txt", JSON.stringify(res)) } catch {}
        return normalizeConfig(res)
      } catch (error) {
        try { require("node:fs").writeFileSync("/tmp/opencode/sg_getconfig.txt", "ERR: " + String((error as any)?.type ?? error) + " :: " + JSON.stringify(error)) } catch {}
        context.ui.toast.show({
          message: "Skill groups: RPC indisponible (" + String((error as any)?.type ?? error) + ")",
          variant: "error",
          duration: 5000,
        })
        return { groups: {}, repos: {} }
      }
    }

    const saveConfig = async (config: StoreData): Promise<StoreData> => {
      try {
        const saved = await rpc.saveConfig(config, { location: rpcLocation() })
        return normalizeConfig(saved ?? config)
      } catch (error) {
        context.ui.toast.show({
          message: "Skill groups: échec de sauvegarde (" + String((error as any)?.type ?? error) + ")",
          variant: "error",
          duration: 5000,
        })
        return config
      }
    }

    const syncSkills = async (): Promise<any[]> => {
      const location = context.location ?? context.data.location.default()
      await context.data.location.skill.sync(location)
      return context.data.location.skill.list(location) ?? []
    }

    const syncProjects = async (): Promise<any[]> => {
      await context.data.project.sync()
      return context.data.project.list() ?? []
    }

    const currentProjectId = (): string => {
      const location = context.location ?? context.data.location.default()
      return location?.project?.id ?? location?.directory ?? ""
    }

    const manageGroups = async () => {
      while (true) {
        const config = await getConfig()
        const groupIds = Object.keys(config.groups)
        const options = [
          ...groupIds.map((id) => ({ title: config.groups[id].name, value: id })),
          { title: "Créer un groupe", value: "__create__" },
          { title: "Retour", value: "__back__" },
        ]
        const choice = await context.ui.dialog.select({ title: "Gérer les groupes", options })
        if (!choice || choice === "__back__") return

        if (choice === "__create__") {
          const name = await context.ui.dialog.prompt({ title: "Nom du groupe", placeholder: "Mon groupe" })
          if (!name) continue
          const id = uniqueGroupId(config, slugify(name))
          const next: StoreData = {
            ...config,
            groups: { ...config.groups, [id]: { id, name: name.trim(), skills: [] } },
          }
          await saveConfig(next)
          continue
        }

        const groupId = choice
        while (true) {
          const cfg = await getConfig()
          const grp = cfg.groups[groupId]
          if (!grp) break
          const sub = await context.ui.dialog.select({
            title: grp.name,
            options: [
              { title: "Renommer", value: "rename" },
              { title: "Éditer les skills", value: "edit" },
              { title: "Supprimer", value: "delete" },
              { title: "Retour", value: "back" },
            ],
          })
          if (!sub || sub === "back") break

          if (sub === "rename") {
            const newName = await context.ui.dialog.prompt({ title: "Nouveau nom", placeholder: grp.name })
            if (!newName) continue
            const next: StoreData = {
              ...cfg,
              groups: { ...cfg.groups, [groupId]: { ...grp, name: newName.trim() } },
            }
            await saveConfig(next)
            continue
          }

          if (sub === "edit") {
            const skills = await syncSkills()
            let working = await getConfig()
            while (true) {
              const group = working.groups[groupId]
              const options2 = [
                ...skills.map((skill: any) => {
                  const id2 = String(skill.id ?? skill.name)
                  const checked = group?.skills?.includes(id2) ? "✓" : " "
                  return { title: `${checked} ${id2}`, value: id2 }
                }),
                { title: "Terminé", value: "__done__" },
              ]
              const selected = await context.ui.dialog.select({ title: `Skills: ${group?.name ?? groupId}`, options: options2 })
              if (!selected || selected === "__done__") break
              const nextSkills = new Set(group?.skills ?? [])
              if (nextSkills.has(selected)) nextSkills.delete(selected)
              else nextSkills.add(selected)
              working = {
                ...working,
                groups: {
                  ...working.groups,
                  [groupId]: { ...group, skills: [...nextSkills] },
                },
              }
              await saveConfig(working)
            }
            continue
          }

          if (sub === "delete") {
            const confirmed = await context.ui.dialog.confirm({ title: "Confirmation", message: `Supprimer le groupe "${grp.name}" ?` })
            if (!confirmed) continue
            const nextGroups = { ...cfg.groups }
            delete nextGroups[groupId]
            const next: StoreData = { ...cfg, groups: nextGroups }
            await saveConfig(next)
            break
          }
        }
      }
    }

    const activateForRepo = async (preselected?: string) => {
      const projects = await syncProjects()
      let projectId = preselected
      let repoLabel = projectId

      if (!projectId) {
        const options = projects.map((project: any) => ({
          title: project.canonical ?? project.directory ?? project.name ?? project.id,
          value: project.id,
        }))
        if (options.length === 0) {
          await context.ui.dialog.alert({ title: "Projets", message: "Aucun projet disponible." })
          return
        }
        projectId = await context.ui.dialog.select({
          title: "Choisir un dépôt",
          current: currentProjectId(),
          options,
        })
        if (!projectId) return
      }

      const selectedProject = projects.find((project: any) => project.id === projectId)
      repoLabel = selectedProject?.canonical ?? selectedProject?.directory ?? projectId

      const skills = await syncSkills()
      let config = await getConfig()
      let repo: RepoConfig = config.repos[projectId] ?? { groups: [], skills: [] }

      // Phase 1: toggle groups
      while (true) {
        const groupIds = Object.keys(config.groups)
        const optionsList = [
          ...groupIds.map((id) => {
            const checked = repo.groups.includes(id) ? "✓" : " "
            return { title: `${checked} ${config.groups[id].name}`, value: id }
          }),
          { title: "Suivant: skills individuels", value: "__next__" },
        ]
        const selected = await context.ui.dialog.select({
          title: `Groupes pour ${repoLabel}`,
          options: optionsList.length > 1 ? optionsList : [{ title: "Aucun groupe défini", value: "__next__" }],
        })
        if (!selected) return
        if (selected === "__next__") break
        if (repo.groups.includes(selected)) {
          repo = { ...repo, groups: repo.groups.filter((id) => id !== selected) }
        } else {
          repo = { ...repo, groups: [...repo.groups, selected] }
        }
        config = { ...config, repos: { ...config.repos, [projectId]: repo } }
        await saveConfig(config)
      }

      // Phase 2: toggle individual skills
      while (true) {
        const optionsList = [
          ...skills.map((skill: any) => {
            const id = String(skill.id ?? skill.name)
            const checked = repo.skills.includes(id) ? "✓" : " "
            return { title: `${checked} ${id}`, value: id }
          }),
          { title: "Terminé", value: "__done__" },
        ]
        const selected = await context.ui.dialog.select({ title: "Activer des skills", options: optionsList })
        if (!selected) return
        if (selected === "__done__") break
        if (repo.skills.includes(selected)) {
          repo = { ...repo, skills: repo.skills.filter((id) => id !== selected) }
        } else {
          repo = { ...repo, skills: [...repo.skills, selected] }
        }
        config = { ...config, repos: { ...config.repos, [projectId]: repo } }
        await saveConfig(config)
      }
    }

    const openMenu = async () => {
      while (true) {
        const choice = await context.ui.dialog.select({
          title: "Skill groups",
          options: [
            { title: "Gérer les groupes", value: "manage" },
            { title: "Activer pour le dépôt courant", value: "activate-current" },
            { title: "Activer pour un autre dépôt", value: "activate" },
          ],
        })
        if (!choice) return
        if (choice === "manage") await manageGroups()
        else if (choice === "activate-current") await activateForRepo(currentProjectId())
        else if (choice === "activate") await activateForRepo()
      }
    }

    context.keymap.layer(() => ({
      mode: "global",
      commands: [
        {
          id: "skill-groups.open",
          title: "Skill groups",
          palette: true,
          slash: { name: "skill-groups" },
          run: () => openMenu(),
        },
      ],
    }))

    return () => {}
  },
})