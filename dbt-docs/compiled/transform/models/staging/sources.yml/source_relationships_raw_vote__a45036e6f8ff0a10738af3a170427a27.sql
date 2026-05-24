
    
    

with child as (
    select vote_id as from_field
    from "postgres"."public"."vote_positions"
    where vote_id is not null
),

parent as (
    select vote_id as to_field
    from "postgres"."public"."votes"
)

select
    from_field

from child
left join parent
    on child.from_field = parent.to_field

where parent.to_field is null


