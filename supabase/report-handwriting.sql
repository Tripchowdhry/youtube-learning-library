-- Lets Report Writer keep the text it reads from your handwritten notes.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.
--
-- It adds one column to the reports table only. The text is kept with each report, as
-- { "video:<id>": "the text", "article:<id>": "…" }, so your handwritten notes themselves
-- are never changed. To remove it again: alter table public.reports drop column handwriting;

alter table public.reports add column if not exists handwriting jsonb not null default '{}'::jsonb;

-- Tell the API about the new column straight away.
notify pgrst, 'reload schema';
