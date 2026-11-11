
    
    

with all_values as (

    select
        seat_status as value_field,
        count(*) as n_records

    from "postgres"."public"."deputy_seat_status"
    group by seat_status

)

select *
from all_values
where value_field not in (
    'sitting','unconfirmed','departed'
)


