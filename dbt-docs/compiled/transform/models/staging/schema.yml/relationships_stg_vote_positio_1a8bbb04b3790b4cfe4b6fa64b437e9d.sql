
    
    

with child as (
    select deputy_id as from_field
    from "postgres"."analytics_staging"."stg_vote_positions"
    where deputy_id is not null
),

parent as (
    select deputy_id as to_field
    from "postgres"."analytics_staging"."stg_deputies"
)

select
    from_field

from child
left join parent
    on child.from_field = parent.to_field

where parent.to_field is null


