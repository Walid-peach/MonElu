
    
    

with all_values as (

    select
        party as value_field,
        count(*) as n_records

    from (select * from "postgres"."analytics_staging"."stg_deputies" where party is not null) dbt_subquery
    group by party

)

select *
from all_values
where value_field not in (
    'Rassemblement National','Ensemble pour la République','La France insoumise - Nouveau Front Populaire','Socialistes et apparentés','Droite Républicaine','Écologiste et Social','Les Démocrates','Horizons & Indépendants','Libertés, Indépendants, Outre-mer et Territoires','Union des droites pour la République','Gauche Démocrate et Républicaine','Non inscrit'
)


