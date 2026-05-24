
    
    

select
    vote_id as unique_field,
    count(*) as n_records

from "postgres"."analytics_staging"."stg_votes"
where vote_id is not null
group by vote_id
having count(*) > 1


