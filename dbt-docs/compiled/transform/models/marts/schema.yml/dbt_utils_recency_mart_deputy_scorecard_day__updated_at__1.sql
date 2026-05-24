






with recency as (

    select 

      
      
        max(updated_at) as most_recent

    from "postgres"."analytics_marts"."mart_deputy_scorecard"

    

)

select

    
    most_recent,
    cast(

    now() + ((interval '1 day') * (-1))

 as timestamp) as threshold

from recency
where most_recent < cast(

    now() + ((interval '1 day') * (-1))

 as timestamp)

