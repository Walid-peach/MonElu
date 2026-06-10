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
        case
            when lower(result) = 'adopté' then true
            else false
        end                                      as is_adopted

    from source
    where vote_id is not null
      and voted_at is not null
)

select * from renamed
