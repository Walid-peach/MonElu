with deputies as (
    select * from "postgres"."analytics_staging"."stg_deputies"
),

positions as (
    select * from "postgres"."analytics_staging"."stg_vote_positions"
),

total_votes as (
    select count(*) as total from "postgres"."analytics_staging"."stg_votes"
),

last_ingested as (
    select max(ingested_at) as ingested_at from "postgres"."analytics_staging"."stg_vote_positions"
),

deputy_stats as (
    select
        p.deputy_id,
        count(*)                                              as votes_cast,
        count(*) filter (where p.position = 'pour')          as votes_pour,
        count(*) filter (where p.position = 'contre')        as votes_contre,
        count(*) filter (where p.position = 'abstention')    as votes_abstention,
        count(*) filter (where p.position = 'nonvotant')     as votes_nonvotant
    from positions p
    group by p.deputy_id
),

final as (
    select
        d.deputy_id,
        d.full_name,
        d.first_name,
        d.last_name,
        d.party,
        d.department,
        d.mandate_started_at,
        d.mandate_ended_at,
        d.photo_url,
        d.is_active,

        -- vote counts
        coalesce(s.votes_cast, 0)                            as total_votes_cast,
        coalesce(s.votes_pour, 0)                            as total_pour,
        coalesce(s.votes_contre, 0)                          as total_contre,
        coalesce(s.votes_abstention, 0)                      as total_abstention,
        coalesce(s.votes_nonvotant, 0)                       as total_nonvotant,

        -- rates (0 to 1)
        case
            when t.total > 0
            then round(coalesce(s.votes_cast, 0)::numeric / t.total, 4)
            else 0
        end                                                  as presence_rate,

        case
            when coalesce(s.votes_cast, 0) > 0
            then round(s.votes_pour::numeric / s.votes_cast, 4)
            else 0
        end                                                  as votes_for_pct,

        case
            when coalesce(s.votes_cast, 0) > 0
            then round(s.votes_abstention::numeric / s.votes_cast, 4)
            else 0
        end                                                  as abstention_pct,

        -- metadata: reflects last ingest, not query time — makes recency test meaningful
        l.ingested_at                                        as updated_at

    from deputies d
    left join deputy_stats s on d.deputy_id = s.deputy_id
    cross join total_votes t
    cross join last_ingested l
)

select * from final