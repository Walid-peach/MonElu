with deputies as (
    select * from "postgres"."analytics_staging"."stg_deputies"
),

positions as (
    select * from "postgres"."analytics_staging"."stg_vote_positions"
),

majority as (
    select * from "postgres"."analytics_intermediate"."int_party_vote_majority"
),

last_ingested as (
    select max(ingested_at) as ingested_at from "postgres"."analytics_staging"."stg_vote_positions"
),

deputy_alignment as (
    select
        d.deputy_id,
        d.full_name,
        d.party,
        d.department,
        count(*)                                            as total_votes,
        count(*) filter (
            where p.position = m.majority_position
        )                                                   as aligned_votes,
        count(*) filter (
            where p.position != m.majority_position
            and p.position in ('pour', 'contre', 'abstention')
        )                                                   as dissident_votes
    from positions p
    join deputies d on p.deputy_id = d.deputy_id
    join majority m on p.vote_id = m.vote_id
        and d.party = m.party
    where p.position in ('pour', 'contre', 'abstention')
      and d.party is not null
    group by d.deputy_id, d.full_name, d.party, d.department
),

final as (
    select
        deputy_id,
        full_name,
        party,
        department,
        total_votes,
        aligned_votes,
        dissident_votes,
        case
            when total_votes > 0
            then round(aligned_votes::numeric / total_votes, 4)
            else 0
        end                                                 as party_alignment_rate,
        case
            when total_votes > 0
            then round(dissident_votes::numeric / total_votes, 4)
            else 0
        end                                                 as dissident_rate,
        l.ingested_at                                       as updated_at
    from deputy_alignment
    cross join last_ingested l
)

select * from final