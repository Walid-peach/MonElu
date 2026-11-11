-- A deputy the AN's active-deputies export (AMO10) no longer lists, with no
-- end date in the all-mandates export (AMO20) either (#682). ingest_deputies.py
-- never guesses a mandate_end, so the deputy is `unconfirmed`: the site stops
-- counting them as sitting, and this fails the daily data-quality gate on the
-- first run it happens rather than when a successor takes the seat, which
-- assert_one_sitting_deputy_per_seat would only catch then (or never, for a
-- seat that stays vacant). One row per unconfirmed deputy.
select
    d.deputy_id,
    d.full_name,
    d.department || ' ' || d.circonscription as seat,
    d.last_listed_at
from "postgres"."public"."deputy_seat_status" s
join "postgres"."public"."deputies" d using (deputy_id)
where s.seat_status = 'unconfirmed'