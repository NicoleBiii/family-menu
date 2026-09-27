import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { sql, type Transaction } from 'kysely';
import { APP_CONFIG, type AppConfig } from './config.js';
import { DatabaseService, type Database } from './database.service.js';
import { isUuid, randomToken, sha256 } from './security.js';

export const INVITATION_SECONDS = 7 * 24 * 60 * 60;
export const MAX_ACTIVE_INVITATIONS = 20;
type Role = 'owner' | 'member';

export function parseHouseholdInput(body: unknown) {
  const input = (body ?? {}) as { name?: unknown; timezone?: unknown };
  if (typeof input.name !== 'string') throw new BadRequestException('name is required.');
  const name = input.name.trim();
  if (name.length < 1 || name.length > 100) {
    throw new BadRequestException('name must be 1–100 characters.');
  }
  let timezone = 'America/Toronto';
  if (input.timezone !== undefined) {
    if (typeof input.timezone !== 'string' || !isTimeZone(input.timezone)) {
      throw new BadRequestException('timezone must be a valid IANA time zone.');
    }
    timezone = input.timezone;
  }
  return { name, timezone };
}

function isTimeZone(value: string) {
  if (value.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function parseInvitationToken(body: unknown): string {
  const token = (body as { token?: unknown } | null)?.token;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{20,100}$/.test(token)) {
    throw new NotFoundException('Invitation is not valid.');
  }
  return token;
}

/**
 * Household authorization lives here, on the server. Every business query is scoped by a
 * membership check for the signed-in user; non-members receive 404 so identifiers of other
 * households are not confirmed.
 */
@Injectable()
export class HouseholdsService {
  constructor(
    private readonly database: DatabaseService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async listForUser(userId: string) {
    return this.database.db
      .selectFrom('app.household_members as m')
      .innerJoin('app.households as h', 'h.id', 'm.household_id')
      .select(['h.id', 'h.name', 'h.timezone', 'm.role'])
      .where('m.user_id', '=', userId)
      .orderBy('m.created_at')
      .execute();
  }

  async create(userId: string, input: { name: string; timezone: string }) {
    return this.database.db.transaction().execute(async (trx) => {
      const household = await trx
        .insertInto('app.households')
        .values(input)
        .returning(['id', 'name', 'timezone'])
        .executeTakeFirstOrThrow();
      await trx
        .insertInto('app.household_members')
        .values({ household_id: household.id, user_id: userId, role: 'owner' })
        .execute();
      return { ...household, role: 'owner' as Role };
    });
  }

  /**
   * Returns the caller's role or throws 404 when the caller is not a current member.
   * With `lock`, the membership row is held FOR SHARE until the surrounding transaction ends, so a
   * concurrent removal waits for the caller's write (or the write sees the removal) and a removed
   * member can never complete a mutation after the removal commits.
   */
  async requireMember(
    userId: string,
    householdId: string,
    executor: Transaction<Database> | DatabaseService['db'] = this.database.db,
    lock = false,
  ): Promise<Role> {
    if (!isUuid(householdId)) throw new NotFoundException('Household not found.');
    let query = executor
      .selectFrom('app.household_members')
      .select('role')
      .where('household_id', '=', householdId)
      .where('user_id', '=', userId);
    if (lock) query = query.forShare();
    const row = await query.executeTakeFirst();
    if (!row) throw new NotFoundException('Household not found.');
    return row.role;
  }

  async requireOwner(userId: string, householdId: string) {
    if ((await this.requireMember(userId, householdId)) !== 'owner') {
      throw new ForbiddenException('Only the household owner can do this.');
    }
  }

  async detail(userId: string, householdId: string) {
    const role = await this.requireMember(userId, householdId);
    const household = await this.database.db
      .selectFrom('app.households')
      .select(['id', 'name', 'timezone'])
      .where('id', '=', householdId)
      .executeTakeFirstOrThrow();
    const members = await this.database.db
      .selectFrom('app.household_members as m')
      .innerJoin('app.user_profiles as p', 'p.id', 'm.user_id')
      .select([
        'p.id as userId',
        'p.display_name as displayName',
        'm.role',
        'm.created_at as joinedAt',
      ])
      .where('m.household_id', '=', householdId)
      .orderBy('m.created_at')
      .execute();
    return { ...household, role, members };
  }

  async removeMember(actorId: string, householdId: string, targetId: string) {
    await this.database.db.transaction().execute(async (trx) => {
      const actorRole = await this.requireMember(actorId, householdId, trx);
      if (!isUuid(targetId)) throw new NotFoundException('Member not found.');
      if (targetId === actorId) {
        if (actorRole === 'owner') {
          throw new ConflictException('The owner cannot leave the household in this version.');
        }
      } else if (actorRole !== 'owner') {
        throw new ForbiddenException('Only the household owner can remove members.');
      }
      const removed = await trx
        .deleteFrom('app.household_members')
        .where('household_id', '=', householdId)
        .where('user_id', '=', targetId)
        .where('role', '=', 'member')
        .executeTakeFirst();
      if (removed.numDeletedRows === 0n) throw new NotFoundException('Member not found.');
    });
  }

  async createInvitation(userId: string, householdId: string) {
    await this.requireOwner(userId, householdId);
    const active = await this.database.db
      .selectFrom('app.household_invitations')
      .select(sql<number>`count(*)::int`.as('count'))
      .where('household_id', '=', householdId)
      .where('revoked_at', 'is', null)
      .where('accepted_at', 'is', null)
      .where('expires_at', '>', sql<Date>`now()`)
      .executeTakeFirstOrThrow();
    if (active.count >= MAX_ACTIVE_INVITATIONS) {
      throw new ConflictException('Too many active invitations. Revoke unused links first.');
    }
    const token = randomToken();
    const invitation = await this.database.db
      .insertInto('app.household_invitations')
      .values({
        household_id: householdId,
        token_hash: sha256(token),
        created_by: userId,
        expires_at: new Date(Date.now() + INVITATION_SECONDS * 1000),
      })
      .returning(['id', 'expires_at as expiresAt'])
      .executeTakeFirstOrThrow();
    // The token is returned once and only its hash is stored. The fragment keeps it out of
    // server logs and Referer headers.
    return { ...invitation, token, url: `${this.config.appOrigin ?? ''}/join#${token}` };
  }

  async listInvitations(userId: string, householdId: string) {
    await this.requireOwner(userId, householdId);
    return this.database.db
      .selectFrom('app.household_invitations as i')
      .innerJoin('app.user_profiles as p', 'p.id', 'i.created_by')
      .select([
        'i.id',
        'i.created_at as createdAt',
        'i.expires_at as expiresAt',
        'p.display_name as createdBy',
      ])
      .where('i.household_id', '=', householdId)
      .where('i.revoked_at', 'is', null)
      .where('i.accepted_at', 'is', null)
      .where('i.expires_at', '>', sql<Date>`now()`)
      .orderBy('i.created_at', 'desc')
      .execute();
  }

  async revokeInvitation(userId: string, householdId: string, invitationId: string) {
    await this.requireOwner(userId, householdId);
    if (!isUuid(invitationId)) throw new NotFoundException('Invitation not found.');
    const result = await this.database.db
      .updateTable('app.household_invitations')
      .set({ revoked_at: sql`now()` })
      .where('id', '=', invitationId)
      .where('household_id', '=', householdId)
      .where('revoked_at', 'is', null)
      .where('accepted_at', 'is', null)
      .executeTakeFirst();
    if (result.numUpdatedRows === 0n) throw new NotFoundException('Invitation not found.');
  }

  async previewInvitation(userId: string, token: string) {
    const invitation = await this.database.db
      .selectFrom('app.household_invitations as i')
      .innerJoin('app.households as h', 'h.id', 'i.household_id')
      .select(['h.id', 'h.name', 'i.expires_at', 'i.revoked_at', 'i.accepted_by'])
      .where('i.token_hash', '=', sha256(token))
      .executeTakeFirst();
    if (!invitation) throw new NotFoundException('Invitation is not valid.');
    const member = await this.database.db
      .selectFrom('app.household_members')
      .select('role')
      .where('household_id', '=', invitation.id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!member) this.assertUsable(invitation);
    return {
      householdName: invitation.name,
      expiresAt: invitation.expires_at,
      alreadyMember: Boolean(member),
    };
  }

  /** Single-use: the row lock serializes concurrent acceptances of the same link. */
  async acceptInvitation(userId: string, token: string) {
    return this.database.db.transaction().execute(async (trx) => {
      const invitation = await trx
        .selectFrom('app.household_invitations')
        .select(['id', 'household_id', 'expires_at', 'revoked_at', 'accepted_by'])
        .where('token_hash', '=', sha256(token))
        .forUpdate()
        .executeTakeFirst();
      if (!invitation) throw new NotFoundException('Invitation is not valid.');
      const existing = await trx
        .selectFrom('app.household_members')
        .select('role')
        .where('household_id', '=', invitation.household_id)
        .where('user_id', '=', userId)
        .executeTakeFirst();
      if (!existing) {
        this.assertUsable(invitation);
        // Conditional claim: even without the row lock, a second acceptor's UPDATE re-checks
        // accepted_at after the first commits and matches no row.
        const claimed = await trx
          .updateTable('app.household_invitations')
          .set({ accepted_by: userId, accepted_at: sql`now()` })
          .where('id', '=', invitation.id)
          .where('accepted_at', 'is', null)
          .where('revoked_at', 'is', null)
          .where('expires_at', '>', sql<Date>`now()`)
          .executeTakeFirst();
        if (claimed.numUpdatedRows !== 1n) {
          throw new GoneException('This invitation has expired or is no longer valid.');
        }
        await trx
          .insertInto('app.household_members')
          .values({ household_id: invitation.household_id, user_id: userId, role: 'member' })
          .execute();
      }
      const household = await trx
        .selectFrom('app.households')
        .select(['id', 'name', 'timezone'])
        .where('id', '=', invitation.household_id)
        .executeTakeFirstOrThrow();
      return { ...household, role: existing?.role ?? ('member' as Role) };
    });
  }

  /** A used link never re-admits anyone, including a member who was later removed. */
  private assertUsable(invitation: {
    expires_at: Date;
    revoked_at: Date | null;
    accepted_by: string | null;
  }) {
    if (
      invitation.revoked_at ||
      invitation.expires_at.getTime() <= Date.now() ||
      invitation.accepted_by
    ) {
      throw new GoneException('This invitation has expired or is no longer valid.');
    }
  }
}
