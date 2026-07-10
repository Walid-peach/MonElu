with deputies as (
    select * from "postgres"."analytics_staging"."stg_deputies"
),

positions as (
    select * from "postgres"."analytics_staging"."stg_vote_positions"
),

votes as (
    select * from "postgres"."analytics_staging"."stg_votes"
),

last_ingested as (
    select max(ingested_at) as ingested_at from "postgres"."analytics_staging"."stg_vote_positions"
),

-- Presence denominator: only votes held during the deputy's mandate window.
-- A null mandate_started_at is treated as unbounded so the deputy isn't
-- zeroed out by missing data.
eligible_votes as (
    select
        d.deputy_id,
        count(v.vote_id) as eligible
    from deputies d
    left join votes v
        on (d.mandate_started_at is null or v.voted_at >= d.mandate_started_at)
        and (d.mandate_ended_at is null or v.voted_at <= d.mandate_ended_at)
    group by d.deputy_id
),

-- Scrutins solennels only (vote_type = 'sps') — scheduled whole-text votes
-- where chamber-wide attendance is expected, unlike the amendment-by-
-- amendment scrutins publics ordinaires that dominate eligible_votes.
-- Motions de censure ('moc') are excluded: only the motion's supporters
-- vote on those by design, so counting them punishes majority deputies
-- for a strategic choice, not an absence (see MON-124's empirical writeup
-- in notes/dispatch/presence_kpi_comparison_2026-07-09.md, finding #3).
eligible_solennels as (
    select
        d.deputy_id,
        count(v.vote_id) as eligible
    from deputies d
    left join votes v
        on v.vote_type = 'sps'
        and (d.mandate_started_at is null or v.voted_at >= d.mandate_started_at)
        and (d.mandate_ended_at is null or v.voted_at <= d.mandate_ended_at)
    group by d.deputy_id
),

-- Voting-day denominator: distinct calendar days on which at least one
-- scrutin was held during the mandate window. Collapses same-day amendment
-- marathons (a single sitting can hold dozens of scrutins) into one
-- observation, so this proxies physical attendance far better than
-- per-scrutin counting.
eligible_voting_days as (
    select
        d.deputy_id,
        count(distinct date_trunc('day', v.voted_at)) as eligible
    from deputies d
    left join votes v
        on (d.mandate_started_at is null or v.voted_at >= d.mandate_started_at)
        and (d.mandate_ended_at is null or v.voted_at <= d.mandate_ended_at)
    group by d.deputy_id
),

deputy_stats as (
    select
        p.deputy_id,
        count(*)                                              as votes_cast,
        count(*) filter (where p.position = 'pour')          as votes_pour,
        count(*) filter (where p.position = 'contre')        as votes_contre,
        count(*) filter (where p.position = 'abstention')    as votes_abstention,
        count(*) filter (where p.position = 'nonvotant')     as votes_nonvotant,
        count(*) filter (
            where p.position in ('pour', 'contre', 'abstention')
        )                                                     as votes_expressed
    from positions p
    group by p.deputy_id
),

-- Solennel participation and voting-day presence both require the vote's
-- vote_type / voted_at, so this joins positions to votes rather than
-- reusing deputy_stats (which aggregates over positions alone).
deputy_solennel_stats as (
    select
        p.deputy_id,
        count(*) filter (where v.vote_type = 'sps')            as solennels_cast,
        count(distinct date_trunc('day', v.voted_at))          as voting_days_present
    from positions p
    join votes v on v.vote_id = p.vote_id
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
        -- presence: nonVotant counts as present (canonical definition — see
        -- docs/decisions.md); denominator is votes during the mandate window.
        -- least() guards data quirks where a position exists outside the
        -- recorded window, keeping the accepted_range test honest.
        case
            when e.eligible > 0
            then least(round(coalesce(s.votes_cast, 0)::numeric / e.eligible, 4), 1)
            else 0
        end                                                  as presence_rate,

        -- pour/abstention percentages use expressed positions only
        -- (pour + contre + abstention) — nonVotant is presence, not an opinion.
        case
            when coalesce(s.votes_expressed, 0) > 0
            then round(s.votes_pour::numeric / s.votes_expressed, 4)
            else 0
        end                                                  as votes_for_pct,

        case
            when coalesce(s.votes_expressed, 0) > 0
            then round(s.votes_abstention::numeric / s.votes_expressed, 4)
            else 0
        end                                                  as abstention_pct,

        -- solennels: eligible=0 (no scrutin solennel yet in the deputy's
        -- window) reads as 0, matching the presence_rate convention above.
        coalesce(so.solennels_cast, 0)                       as total_solennels_cast,
        coalesce(es.eligible, 0)                             as eligible_solennels,
        case
            when es.eligible > 0
            then least(round(coalesce(so.solennels_cast, 0)::numeric / es.eligible, 4), 1)
            else 0
        end                                                  as solennel_participation_rate,

        coalesce(so.voting_days_present, 0)                  as total_voting_days_present,
        coalesce(ed.eligible, 0)                             as eligible_voting_days,
        case
            when ed.eligible > 0
            then least(round(coalesce(so.voting_days_present, 0)::numeric / ed.eligible, 4), 1)
            else 0
        end                                                  as voting_days_rate,

        -- metadata: reflects last ingest, not query time — makes recency test meaningful
        l.ingested_at                                        as updated_at

    from deputies d
    left join deputy_stats s on d.deputy_id = s.deputy_id
    left join eligible_votes e on d.deputy_id = e.deputy_id
    left join eligible_solennels es on d.deputy_id = es.deputy_id
    left join eligible_voting_days ed on d.deputy_id = ed.deputy_id
    left join deputy_solennel_stats so on d.deputy_id = so.deputy_id
    cross join last_ingested l
)

select * from final