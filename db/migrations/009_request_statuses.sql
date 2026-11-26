-- Booking becomes a request the teacher accepts. New statuses (added alone: Postgres
-- can't use a new enum value in the same transaction that creates it).
--   requested : waiting for the teacher (holds the slot, holds the credit)
--   proposed  : alternative time offered (proposal_stage says who must answer); holds slot + credit
--   declined  : teacher declined / didn't answer in time (frees slot + credit)
--   not_taken : parent declined the proposal / it expired / nothing could be found (frees slot + credit)
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'requested';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'proposed';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'declined';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'not_taken';
