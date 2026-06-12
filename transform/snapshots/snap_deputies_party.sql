{% snapshot snap_deputies_party %}

{{
    config(
        schema='snapshots',
        unique_key='deputy_id',
        strategy='check',
        check_cols=['party'],
    )
}}

-- Forward-only history of party membership. Historical switches before the
-- first snapshot run are unrecoverable (raw deputies only stores the current
-- party), but from now on every change is captured — the prerequisite for
-- ever scoring party alignment against the party held at vote time (MON-24).
select
    deputy_id,
    full_name,
    party,
    ingested_at
from {{ source('raw', 'deputies') }}

{% endsnapshot %}
