





with validation_errors as (

    select
        party, vote_id
    from "postgres"."analytics_intermediate"."int_party_vote_majority"
    group by party, vote_id
    having count(*) > 1

)

select *
from validation_errors


