import { z } from "zod";

const projectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(60),
  rows: z.array(z.record(z.unknown())),
});

export const workspaceSchema = z.object({
  projects: z.array(projectSchema).min(1),
  active: z.string(),
}).refine(({ projects, active }) =>
  new Set(projects.map(project => project.id)).size === projects.length &&
  projects.some(project => project.id === active)
);

export const revisionSchema = z.object({ revision: z.number().int().nonnegative().safe() });
export const workspaceResponseSchema = revisionSchema.extend({ data: workspaceSchema.nullable() });
