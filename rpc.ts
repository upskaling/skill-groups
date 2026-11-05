import { Rpc } from "@opencode/plugin/rpc"

export const SkillGroups = Rpc.define({
  id: "skill-groups",
  methods: {
    getConfig: {
      input: { type: "object", additionalProperties: true },
      output: { type: "object", additionalProperties: true },
    },
    saveConfig: {
      input: { type: "object", additionalProperties: true },
      output: { type: "object", additionalProperties: true },
    },
  },
  events: {
    updated: {
      schema: { type: "object", additionalProperties: true },
    },
  },
})