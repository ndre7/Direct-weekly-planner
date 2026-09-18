import { relations } from 'drizzle-orm';
import { boolean, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(), // Firebase Auth UID
  email: text('email').notNull(),
  username: text('username').unique(),
  passwordHash: text('password_hash'),
  suspended: boolean('suspended').default(false).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const planners = pgTable('planners', {
  id: serial('id').primaryKey(),
  userId: text('user_id').references(() => users.uid).notNull().unique(), // Link to user's Firebase UID
  data: text('data').notNull(), // JSON stringified planner data
  syncedAt: timestamp('synced_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ one }) => ({
  planner: one(planners, {
    fields: [users.uid],
    references: [planners.userId],
  }),
}));

export const plannersRelations = relations(planners, ({ one }) => ({
  user: one(users, {
    fields: [planners.userId],
    references: [users.uid],
  }),
}));
