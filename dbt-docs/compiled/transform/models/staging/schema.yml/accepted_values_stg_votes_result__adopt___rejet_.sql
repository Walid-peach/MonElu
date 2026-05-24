
    
    

with all_values as (

    select
        result as value_field,
        count(*) as n_records

    from "postgres"."analytics_staging"."stg_votes"
    group by result

)

select *
from all_values
where value_field not in (
    'adopté','rejeté'
)


