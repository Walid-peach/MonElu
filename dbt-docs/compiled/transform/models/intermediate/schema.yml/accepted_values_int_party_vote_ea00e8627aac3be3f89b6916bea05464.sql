
    
    

with all_values as (

    select
        majority_position as value_field,
        count(*) as n_records

    from "postgres"."analytics_intermediate"."int_party_vote_majority"
    group by majority_position

)

select *
from all_values
where value_field not in (
    'pour','contre','abstention'
)


