-- Migration: Remove proof and public_values fields from withdraw_requests table

ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS proof;
ALTER TABLE withdraw_requests DROP COLUMN IF EXISTS public_values;

