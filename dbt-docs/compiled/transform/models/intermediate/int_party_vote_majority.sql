with position_counts as (
    select
        d.party,
        p.vote_id,
        p.position,
        count(*) as position_count
    from "postgres"."analytics_staging"."stg_vote_positions" p
    join "postgres"."analytics_staging"."stg_deputies" d on p.deputy_id = d.deputy_id
    where p.position in ('pour', 'contre', 'abstention')
      and d.party is not null
    group by d.party, p.vote_id, p.position
)

select distinct on (party, vote_id)
    party,
    vote_id,
    position as majority_position
from position_counts
-- position as final key makes ties deterministic (pour 40 / contre 40 would
-- otherwise resolve to whichever row Postgres returns first)
order by party, vote_id, position_count desc, position