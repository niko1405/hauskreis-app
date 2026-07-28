-- How many people fit. Nullable on purpose: most homes have no meaningful
-- limit, and a default number would be a guess that silently shapes the
-- suggestions.
ALTER TABLE "location" ADD COLUMN "capacity" INTEGER;
