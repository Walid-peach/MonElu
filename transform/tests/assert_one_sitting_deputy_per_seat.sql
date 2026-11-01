-- A deputy who leaves the Assemblée drops out of the AN's active-deputies
-- export, and until #621 nothing ever closed their mandate: ten seats showed
-- two sitting deputies and the chamber 587 of its 577. ingest_deputies.py now
-- closes those mandates from the all-mandates export; this fails when one
-- slips through, whatever the reason. One row per seat held by two or more
-- deputies without a mandate end, plus one when the chamber is over 577.
with sitting as (
    select deputy_id, department, circonscription
    from {{ source('raw', 'deputies') }}
    where mandate_end is null
)

select
    department || ' ' || circonscription as seat,
    count(*) as sitting_deputies
from sitting
group by department, circonscription
having count(*) > 1

union all

select
    'whole chamber' as seat,
    count(*) as sitting_deputies
from sitting
having count(*) > 577
