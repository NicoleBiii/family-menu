import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Kysely, PostgresDialect, sql, type Generated } from 'kysely';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from './config.js';

interface Database {
  'app.user_profiles': {
    id: string;
    display_name: string;
    email: string | null;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
  };
  'app.households': {
    id: Generated<string>;
    name: string;
    timezone: Generated<string>;
    created_at: Generated<Date>;
  };
  'app.household_members': {
    household_id: string;
    user_id: string;
    role: 'owner' | 'member';
    created_at: Generated<Date>;
  };
  'app.oauth_states': {
    state_hash: Buffer;
    code_verifier: string;
    return_to: string;
    expires_at: Date;
    created_at: Generated<Date>;
  };
  'app.sessions': {
    id: Generated<string>;
    token_hash: Buffer;
    user_id: string;
    csrf_token: string;
    created_at: Generated<Date>;
    last_seen_at: Generated<Date>;
    expires_at: Date;
    revoked_at: Date | null;
  };
  'app.household_invitations': {
    id: Generated<string>;
    household_id: string;
    token_hash: Buffer;
    created_by: string;
    created_at: Generated<Date>;
    expires_at: Date;
    revoked_at: Date | null;
    accepted_by: string | null;
    accepted_at: Date | null;
  };
  'app.recipes': {
    id: Generated<string>;
    household_id: string;
    name: string;
    description: string;
    servings: number;
    price_points: number;
    steps: string[];
    source: 'manual' | 'preset' | 'ai';
    source_preset_id: string | null;
    source_preset_version: number | null;
    source_ai_draft_id: Generated<string | null>;
    create_request_id: string;
    revision: Generated<number>;
    created_by: string;
    updated_by: string;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
    archived_at: Date | null;
  };
  'app.recipe_ingredients': {
    household_id: string;
    recipe_id: string;
    position: number;
    name: string;
    ingredient_key: string;
    /** PostgreSQL numeric, kept as a decimal string to avoid binary floating point. */
    quantity: string | null;
    unit: string | null;
    form: string | null;
    note: string | null;
  };
  'app.recipe_images': {
    id: Generated<string>;
    household_id: string;
    recipe_id: string;
    content: Buffer;
    content_type: 'image/webp';
    width: number;
    height: number;
    created_by: string;
    created_at: Generated<Date>;
  };
  'app.meal_orders': {
    id: Generated<string>;
    household_id: string;
    status: Generated<'pending' | 'completed' | 'cancelled'>;
    scheduled_at: Date;
    /** Write as YYYY-MM-DD; read through to_char to avoid local-midnight Date parsing. */
    meal_date: string;
    /** Write as HH:MM; read through to_char. */
    meal_time: string;
    timezone: string;
    notes: string;
    create_request_id: string;
    revision: Generated<number>;
    created_by: string;
    updated_by: string;
    created_at: Generated<Date>;
    updated_at: Generated<Date>;
    closed_by: string | null;
    closed_at: Date | null;
  };
  'app.meal_order_items': {
    id: Generated<string>;
    household_id: string;
    order_id: string;
    position: number;
    recipe_id: string;
    servings: number;
    recipe_name: string;
    recipe_servings: number;
    price_points: number;
    steps: string[];
    ingredients: string; // JSON text on write; parsed jsonb on read
    recipe_revision: number;
    snapshot_at: Generated<Date>;
  };
  'app.ai_draft_requests': {
    id: Generated<string>;
    household_id: string;
    created_by: string;
    create_request_id: string;
    dish_name: string;
    preferences: string;
    status: Generated<'queued' | 'running' | 'succeeded' | 'failed'>;
    provider: string;
    model: string;
    /** bigint micro-USD; pg returns it as a string. */
    reserved_micros: string | number;
    charged_micros: string | number | null;
    input_tokens: number | null;
    output_tokens: number | null;
    lease_expires_at: Date | null;
    started_at: Date | null;
    finished_at: Date | null;
    latency_ms: number | null;
    error_code: AiDraftErrorCode | null;
    draft: string | null; // JSON text on write; parsed jsonb on read
    saved_recipe_id: string | null;
    saved_by: string | null;
    saved_at: Date | null;
    discarded_by: string | null;
    discarded_at: Date | null;
    created_at: Generated<Date>;
  };
  'app.audit_events': {
    id: Generated<string>;
    household_id: string;
    actor_id: string;
    entity_type: 'meal_order';
    entity_id: string;
    action: 'create' | 'update' | 'complete' | 'cancel';
    revision: number;
    created_at: Generated<Date>;
  };
}

export type AiDraftErrorCode =
  'timeout' | 'provider_error' | 'invalid_output' | 'refused' | 'interrupted' | 'expired';

export type { Database };

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly db: Kysely<Database>;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({
          connectionString: config.databaseUrl,
          max: 5,
          connectionTimeoutMillis: 2000,
          query_timeout: 2000,
          application_name: 'family-menu-api',
        }),
      }),
    });
  }

  async isReady(): Promise<boolean> {
    const result = await sql<{ ready: boolean }>`
      select to_regclass('app.households') is not null
        and to_regclass('app.household_members') is not null
        and to_regclass('app.sessions') is not null
        and to_regclass('app.household_invitations') is not null
        and to_regclass('app.recipes') is not null
        and to_regclass('app.recipe_ingredients') is not null
        and to_regclass('app.recipe_images') is not null
        and to_regclass('app.meal_orders') is not null
        and to_regclass('app.meal_order_items') is not null
        and to_regclass('app.audit_events') is not null
        and to_regclass('app.ai_draft_requests') is not null as ready
    `.execute(this.db);
    return result.rows[0]?.ready === true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
