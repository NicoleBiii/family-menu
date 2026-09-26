import { Inject, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Kysely, PostgresDialect, sql, type Generated } from 'kysely';
import pg from 'pg';
import { APP_CONFIG, type AppConfig } from './config.js';

interface Database {
  'app.user_profiles': {
    id: string;
    display_name: string;
    created_at: Generated<Date>;
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
}

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
        and to_regclass('app.household_members') is not null as ready
    `.execute(this.db);
    return result.rows[0]?.ready === true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.db.destroy();
  }
}
