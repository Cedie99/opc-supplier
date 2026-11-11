-- On-Time Delivery in the quarterly evaluation is now filled by the Purchasing Associate, not the Warehouse.
UPDATE "scoring_templates"
SET "criteria" = (
  SELECT jsonb_agg(
    CASE WHEN c->>'filledBy' = 'warehouse' THEN c - 'filledBy' ELSE c END
    ORDER BY ord
  )
  FROM jsonb_array_elements("criteria") WITH ORDINALITY AS t(c, ord)
)
WHERE "criteria" @> '[{"filledBy": "warehouse"}]';
