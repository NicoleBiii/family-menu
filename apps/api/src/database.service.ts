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
    source: 'manual' | 'preset';
    source_preset_id: string | null;
    source_preset_version: number | null;
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
}

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
        and to_regclass('app.recipe_ingredients') is not null as ready
    `.execute(this.db);
    return result.rows[0]?.ready === true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
