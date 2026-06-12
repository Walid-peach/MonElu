-- mart_vote_summary.pct_pour divides by total_voters (the AN's own aggregate)
-- while deputies_with_position comes from our positions table. They are
-- independent sources and can legitimately differ by a little, but a large gap
-- means an ingestion problem. Fail when the AN claims meaningfully more voters
-- than we have recorded positions for.
select
    vote_id,
    total_voters,
    deputies_with_position
from "postgres"."analytics_marts"."mart_vote_summary"
where total_voters > deputies_with_position + 20