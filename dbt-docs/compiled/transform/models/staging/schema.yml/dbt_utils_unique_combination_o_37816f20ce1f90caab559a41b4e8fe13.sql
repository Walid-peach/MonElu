





with validation_errors as (

    select
        vote_id, deputy_id
    from "postgres"."analytics_staging"."stg_vote_positions"
    group by vote_id, deputy_id
    having count(*) > 1

)

select *
from validation_errors


