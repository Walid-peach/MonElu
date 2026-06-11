with votes as (
    select * from "postgres"."analytics_staging"."stg_votes"
),

positions as (
    select * from "postgres"."analytics_staging"."stg_vote_positions"
),

last_ingested as (
    select max(ingested_at) as ingested_at from "postgres"."analytics_staging"."stg_votes"
),

vote_stats as (
    select
        vote_id,
        count(distinct deputy_id)                       as deputies_with_position
    from positions
    group by vote_id
),

final as (
    select
        v.vote_id,
        v.vote_title,
        v.vote_type,
        v.result,
        v.is_adopted,
        v.voted_at,
        v.vote_month,
        v.vote_year,
        v.votes_for,
        v.votes_against,
        v.abstentions,
        v.total_voters,
        v.dossier_id,
        v.summary_plain,
        v.theme,

        -- participation
        coalesce(s.deputies_with_position, 0)           as deputies_with_position,

        -- pcts
        case
            when v.total_voters > 0
            then round(v.votes_for::numeric / v.total_voters, 4)
            else 0
        end                                             as pct_pour,

        case
            when v.total_voters > 0
            then round(v.votes_against::numeric / v.total_voters, 4)
            else 0
        end                                             as pct_contre,

        l.ingested_at                                   as updated_at

    from votes v
    left join vote_stats s on v.vote_id = s.vote_id
    cross join last_ingested l
)

select * from final