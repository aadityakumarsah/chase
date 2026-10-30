import { z } from "zod";
export const jsonObject = z.record(z.string(), z.json());
export const agentPayloadSchema = z.object({
  agent_config: z.looseObject({
    agent_name: z.string().min(1),
    agent_welcome_message: z.string(),
    webhook_url: z.url().optional(),
    tasks: z.array(jsonObject).min(1),
  }),
  agent_prompts: z.record(
    z.string(),
    z.object({ system_prompt: z.string().min(1) }),
  ),
});
export const providersSchema = z.object({
  language: z.string(),
  providers: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      slug: z.string(),
      is_supported: z.boolean(),
      models: z.array(
        z.object({
          id: z.string(),
          model_id: z.string(),
          is_supported: z.boolean(),
          is_deprecated: z.boolean().optional(),
        }),
      ),
    }),
  ),
});
export const catalogVoiceSchema = z.object({
  id: z.string(),
  voice_id: z.string(),
  name: z.string(),
  gender: z.string().nullish(),
  accent: z.string().nullish(),
});
export const voicesQuerySchema = z.object({
  provider_id: z.uuid(),
  model_id: z.uuid(),
  language: z.string().optional(),
  page: z.number().int().positive().default(1),
  page_size: z.number().int().min(1).max(100).default(100),
});
export type VoicesQuery = z.input<typeof voicesQuerySchema>;
export const sessionInputSchema = z.object({
  agent_id: z.string().min(1),
  user_data: jsonObject,
  agent_data: jsonObject.optional(),
});
export const sessionSchema = z.looseObject({
  run_id: z.string(),
  agent_id: z.string(),
  sip_username: z.string(),
  sip_password: z.string(),
  sip_domain: z.string(),
  wss_url: z.url(),
  sip_register: z.boolean(),
  expires_in: z.number().positive(),
  ice_servers: z.array(
    z.looseObject({
      urls: z.union([z.string(), z.array(z.string())]),
      username: z.string().optional(),
      credential: z.string().optional(),
    }),
  ),
});
export const customModelSchema = z.object({
  custom_model_name: z.string().min(1),
  custom_model_url: z.url({ protocol: /^https$/ }),
  custom_model_key: z.string().min(1),
  custom_model_family: z.string().min(1),
  custom_model_languages: z.string().optional(),
});
