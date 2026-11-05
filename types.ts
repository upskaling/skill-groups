export type SkillGroup = { id: string; name: string; skills: string[] }
export type RepoConfig = { groups: string[]; skills: string[] }
export type StoreData = {
  groups: Record<string, SkillGroup>
  repos: Record<string, RepoConfig>
}