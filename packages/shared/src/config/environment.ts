import { z } from 'zod';

const positiveInt = (defaultValue: number) =>
  z.coerce.number().int().positive().default(defaultValue);

const environmentSchema = z.object({
  DISCORD_TOKEN: z.string().min(1),
  DISCORD_CLIENT_ID: z.string().regex(/^\d{17,20}$/),
  DISCORD_DEV_GUILD_ID: z
    .string()
    .regex(/^\d{17,20}$/)
    .optional(),
  MONGODB_URI: z.string().url(),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
  MUSIC_MAX_QUEUE_LENGTH: positiveInt(500),
  MUSIC_MAX_COLLECTION_ITEMS: positiveInt(200),
  MUSIC_IDLE_DISCONNECT_SECONDS: positiveInt(300),
  MUSIC_DEFAULT_VOLUME: z.coerce.number().min(0).max(1).default(0.75),
  MUSIC_MATCH_THRESHOLD: z.coerce.number().min(0).max(1).default(0.82),
  PARSER_PROVIDER_TIMEOUT_MS: positiveInt(8000),
  PARSER_SEARCH_CACHE_SECONDS: positiveInt(300),
  PARSER_METADATA_CACHE_SECONDS: positiveInt(21600),
  FFMPEG_PATH: z.string().min(1).default('ffmpeg'),
  FFPROBE_PATH: z.string().min(1).default('ffprobe'),
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(
  input: NodeJS.ProcessEnv | Record<string, string | undefined>,
): Environment {
  return environmentSchema.parse(input);
}
