// The database schema. Money columns are integer paise; CHECK constraints keep amounts positive
// even if a bug got past the Server Actions' validation. Column names are snake_case in Postgres
// (drizzle `casing: 'snake_case'`).
import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

const createdAt = () => timestamp({ withTimezone: true }).notNull().defaultNow();

export const users = pgTable('users', {
  id: uuid().primaryKey().defaultRandom(),
  githubId: text().unique(),
  name: text().notNull(),
  image: text(),
  isDemo: boolean().notNull().default(false),
  createdAt: createdAt(),
});

export const groups = pgTable(
  'groups',
  {
    id: uuid().primaryKey().defaultRandom(),
    name: text().notNull(),
    createdBy: uuid().notNull().references(() => users.id),
    // Groups the demo account made: rebuilt (deleted) with the demo, and can't invite anyone.
    isDemo: boolean().notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [check('groups_name_length', sql`char_length(${t.name}) between 1 and 60`)],
);

export const members = pgTable(
  'members',
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid().notNull().references(() => groups.id, { onDelete: 'cascade' }),
    // Null for a placeholder member: a name only, no account.
    userId: uuid().references(() => users.id),
    name: text().notNull(),
    // Join order, which decides who gets a leftover paisa in a split (see src/lib/split.ts).
    seq: integer().generatedAlwaysAsIdentity(),
    createdAt: createdAt(),
  },
  (t) => [
    unique('members_group_user').on(t.groupId, t.userId),
    index('members_user_idx').on(t.userId),
    check('members_name_length', sql`char_length(${t.name}) between 1 and 40`),
  ],
);

export const invites = pgTable('invites', {
  id: uuid().primaryKey().defaultRandom(),
  // One live invite link per group; making a new one replaces it.
  groupId: uuid().notNull().unique().references(() => groups.id, { onDelete: 'cascade' }),
  // SHA-256 of the random token in the link. The token itself is never stored.
  tokenHash: text().notNull().unique(),
  createdBy: uuid().notNull().references(() => users.id),
  createdAt: createdAt(),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
});

export const expenses = pgTable(
  'expenses',
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid().notNull().references(() => groups.id, { onDelete: 'cascade' }),
    description: text().notNull(),
    amountPaise: integer().notNull(),
    paidBy: uuid().notNull().references(() => members.id),
    splitType: text({ enum: ['equal', 'exact', 'percent', 'shares'] }).notNull(),
    spentOn: date({ mode: 'string' }).notNull(),
    // Optimistic locking: every save must name the version it started from.
    version: integer().notNull().default(1),
    createdBy: uuid().notNull().references(() => users.id),
    seq: integer().generatedAlwaysAsIdentity(),
    createdAt: createdAt(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('expenses_group_idx').on(t.groupId),
    check('expenses_amount_positive', sql`${t.amountPaise} > 0 and ${t.amountPaise} <= 1000000000`),
    check('expenses_split_type', sql`${t.splitType} in ('equal', 'exact', 'percent', 'shares')`),
    check('expenses_description_length', sql`char_length(${t.description}) between 1 and 80`),
    check('expenses_version_positive', sql`${t.version} >= 1`),
  ],
);

export const expenseShares = pgTable(
  'expense_shares',
  {
    expenseId: uuid().notNull().references(() => expenses.id, { onDelete: 'cascade' }),
    memberId: uuid().notNull().references(() => members.id),
    // A share can round down to 0 paise (₹0.02 split three ways is 1 + 1 + 0), never below.
    amountPaise: integer().notNull(),
    // What was typed, to refill the edit form: paise (exact), basis points (percent), a weight (shares).
    inputValue: integer(),
  },
  (t) => [
    primaryKey({ columns: [t.expenseId, t.memberId] }),
    index('expense_shares_member_idx').on(t.memberId),
    check('expense_shares_amount_not_negative', sql`${t.amountPaise} >= 0`),
    check('expense_shares_input_positive', sql`${t.inputValue} is null or ${t.inputValue} > 0`),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid().primaryKey().defaultRandom(),
    groupId: uuid().notNull().references(() => groups.id, { onDelete: 'cascade' }),
    fromMember: uuid().notNull().references(() => members.id),
    toMember: uuid().notNull().references(() => members.id),
    amountPaise: integer().notNull(),
    createdBy: uuid().notNull().references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('payments_group_idx').on(t.groupId),
    check('payments_amount_positive', sql`${t.amountPaise} > 0`),
    check('payments_not_to_self', sql`${t.fromMember} <> ${t.toMember}`),
  ],
);

// One row: when the demo was last rebuilt.
export const demoState = pgTable(
  'demo_state',
  {
    id: integer().primaryKey(),
    resetAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [check('demo_state_single_row', sql`${t.id} = 1`)],
);
