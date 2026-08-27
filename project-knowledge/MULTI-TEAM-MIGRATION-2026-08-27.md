# multi_team — migration record (2026-08-27)

The Enterprise capability `multi_team` ("فرق متعدّدة مع صلاحيات منفصلة") was sold
with no product behind it. This is the record of the schema change that gave it
one, and of how to undo it.

## Pre-migration state of production

Read-only inspection against the live database before anything was applied:

```
TeamMember rows ............................ 0
  …with a conversationScope override ....... 0
  …with an allowedNumberIds restriction .... 0
User rows .................................. 4
"Team" table exists ........................ no
database size .............................. 18 MB
```

Zero TeamMember rows is the headline: **no tenant has ever invited a team
member**, so there was no member behaviour that could regress, and nothing in
`TeamMember` to preserve. (Worth carrying forward as a product finding on its
own — the `team` capability sells from Growth up and has never been used.)

## Backup

Full compressed dump taken on the host before the deploy:

```
~/backups/keyone-pre-multiteam-20260827T005321Z.dump   (432K, pg_dump -Fc)
```

Restore with `pg_restore -d "$POSTGRES_URL" --clean <file>`.

## What was applied

Produced by `prisma migrate diff --from-url <prod> --to-schema-datamodel`, i.e.
the exact DDL `prisma db push` executes during `deploy/release-aws.sh`:

```sql
ALTER TABLE "TeamMember" ADD COLUMN "teamId" TEXT;

CREATE TABLE "Team" (
    "id"                TEXT NOT NULL,
    "ownerId"           TEXT NOT NULL,
    "name"              TEXT NOT NULL,
    "description"       TEXT NOT NULL DEFAULT '',
    "conversationScope" TEXT NOT NULL DEFAULT 'team',
    "allowedNumberIds"  TEXT NOT NULL DEFAULT '[]',
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Team_ownerId_idx" ON "Team"("ownerId");
CREATE UNIQUE INDEX "Team_ownerId_name_key" ON "Team"("ownerId", "name");

ALTER TABLE "Team" ADD CONSTRAINT "Team_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
```

**Additive only.** One nullable column, one new table, two indexes, two foreign
keys. No `DROP`, no type change, no `NOT NULL` added to an existing column, no
backfill. `deploy/release-aws.sh` runs `prisma db push` *without*
`--accept-data-loss`, so a destructive diff would have aborted the deploy rather
than executing.

No default Team is created. A migration that invented one would have had to
attach the existing members to it, and attaching a member to a team is exactly
what changes their isolation — so the safe choice is to create nothing and let
an owner opt in. With zero members in production the question was moot anyway.

## Rollback

Reversible with no data loss beyond the teams themselves:

```sql
ALTER TABLE "TeamMember" DROP CONSTRAINT "TeamMember_teamId_fkey";
ALTER TABLE "TeamMember" DROP COLUMN "teamId";
DROP TABLE "Team";
```

Dropping `teamId` returns every member to the pre-teams resolution path
(`own_only`, all numbers) because that is what the resolver falls back to when
no team is attached — the same reason the forward migration is safe. Team rows
are lost; `TeamMember` rows are not touched.

## Non-regression argument

`lib/teams/scope.ts` resolves in the order *member override → team policy →
historical default*, where the historical default is `own_only` over all
numbers. A `TeamMember` row with `teamId = NULL` and an empty override — the
shape of every row the migration leaves behind — resolves to precisely the
restriction `app/api/inbox/conversations/route.ts` hard-coded before this
change. Widening only ever follows an owner explicitly putting someone on a
team. `__tests__/multi-team.test.ts` and `__tests__/multi-team-db.test.ts` both
assert this directly.
