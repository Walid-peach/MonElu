with source as (
    select * from {{ source('raw', 'vote_positions') }}
),

renamed as (
    select
        vote_id,
        deputy_id,
        lower(trim(position))                    as position,
        ingested_at::timestamp                   as ingested_at,

        -- derived
        case
            when lower(trim(position)) = 'pour'       then 1
            when lower(trim(position)) = 'contre'     then 2
            when lower(trim(position)) = 'abstention' then 3
            when lower(trim(position)) = 'nonvotant'  then 4
            else 0
        end                                      as position_code

    from source
    where vote_id is not null
      and deputy_id is not null
)

select * from renamed
