
    
    

select
    deputy_id as unique_field,
    count(*) as n_records

from "postgres"."analytics_marts"."mart_deputy_scorecard"
where deputy_id is not null
group by deputy_id
having count(*) > 1


