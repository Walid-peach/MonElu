with source as (
    select * from "postgres"."public"."deputies"
),

renamed as (
    select
        deputy_id,
        full_name,
        first_name,
        last_name,
        party,
        department,
        mandate_start::timestamp                 as mandate_started_at,
        mandate_end::timestamp                   as mandate_ended_at,
        photo_url,
        ingested_at::timestamp                   as ingested_at,

        -- derived
        case
            when mandate_end is null then true
            else false
        end                                      as is_active

    from source
    where deputy_id is not null
)

select * from renamed