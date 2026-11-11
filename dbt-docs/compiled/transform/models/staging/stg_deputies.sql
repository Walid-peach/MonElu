with source as (
    select * from "postgres"."public"."deputies"
),

-- Sitting is defined once, by the deputy_seat_status view (migration 019, #682).
seat_status as (
    select * from "postgres"."public"."deputy_seat_status"
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
        seat_status.seat_status,
        seat_status.seat_status = 'sitting'      as is_active

    from source
    join seat_status using (deputy_id)
    where deputy_id is not null
)

select * from renamed