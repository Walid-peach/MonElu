
    
    

with all_values as (

    select
        position as value_field,
        count(*) as n_records

    from "postgres"."analytics_staging"."stg_vote_positions"
    group by position

)

select *
from all_values
where value_field not in (
    'pour','contre','abstention','nonvotant'
)


