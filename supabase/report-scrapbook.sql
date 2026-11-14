-- Lets Report Writer use ScrapBook pages as well as videos, readings and tutorials.
-- Paste this into Supabase > SQL Editor > New query, then click Run.
-- It is safe to run more than once.
--
-- It only widens the list of kinds a report's chosen item can be. Report Writer still only
-- reads your ScrapBook pages and never changes them.

alter table public.report_sources drop constraint if exists report_sources_source_kind_check;
alter table public.report_sources add constraint report_sources_source_kind_check
  check (source_kind in ('video', 'article', 'scrap'));

notify pgrst, 'reload schema';
