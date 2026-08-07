with source as (
    select * from {{ source('raw', 'votes') }}
),

renamed as (
    select
        vote_id,
        vote_title,
        trim(lower(vote_type))                   as vote_type,
        lower(result)                            as result,
        voted_at::timestamp                      as voted_at,
        votes_for::integer                       as votes_for,
        votes_against::integer                   as votes_against,
        abstentions::integer                     as abstentions,
        total_voters::integer                    as total_voters,
        dossier_id,
        summary_plain,
        theme,
        ingested_at::timestamp                   as ingested_at,

        -- derived
        date_trunc('month', voted_at)            as vote_month,
        extract(year from voted_at)::integer     as vote_year,
        -- explicit both ways: an unexpected third result value surfaces as
        -- null instead of being silently absorbed into false
        case
            when lower(result) = 'adopté' then true
            when lower(result) = 'rejeté' then false
        end                                      as is_adopted

    from source
    where vote_id is not null
      -- Null voted_at is a tolerated upstream quirk (MON-13, ADR-031); rows are dropped here, not at ingestion
      and voted_at is not null
)

select * from renamed
