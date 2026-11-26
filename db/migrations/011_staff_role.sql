-- Staff accounts (administration team). Added alone: a new enum value can't be used in the same transaction.
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'staff';
