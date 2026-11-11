-- Selection Matrix: "Delivery Reliability" (on-time in-full %) becomes "Delivery Capability & Commitment",
-- rated by hand on lead time, capacity and delivery references. Saved as a new template version so canvasses
-- already created keep the rules they were started with.
WITH cur AS (
  SELECT * FROM "scoring_templates"
  WHERE "kind" = 'selection' AND "is_active" = true
    AND "criteria" @> '[{"key": "delivery", "inputMode": "percent_ratio"}]'
),
deactivated AS (
  UPDATE "scoring_templates" t SET "is_active" = false FROM cur WHERE t."id" = cur."id"
)
INSERT INTO "scoring_templates" ("kind", "category_id", "name", "version", "is_active", "criteria", "bands", "change_note")
SELECT
  cur."kind",
  cur."category_id",
  cur."name",
  (SELECT max(v."version") FROM "scoring_templates" v
    WHERE v."kind" = cur."kind" AND v."category_id" IS NOT DISTINCT FROM cur."category_id") + 1,
  true,
  (
    SELECT jsonb_agg(
      CASE WHEN c->>'key' = 'delivery' THEN
        (c - 'numeratorLabel' - 'denominatorLabel') || jsonb_build_object(
          'name', 'Delivery Capability & Commitment',
          'guideline', 'Assess whether the supplier can meet the required lead time, with sufficient capacity and inventory, backed by verified delivery references or a reliable delivery plan.',
          'metricLabel', 'Lead time, capacity and delivery references',
          'inputMode', 'manual',
          'direction', 'higher_better',
          'unit', '',
          'basis', 'Quoted lead time, capacity and inventory declaration, delivery references',
          'thresholds', '[
            {"rating": 5, "label": "Excellent", "description": "Can meet required lead time, has sufficient capacity and inventory, and provides verified delivery references."},
            {"rating": 4, "label": "Very good", "description": "Can meet required lead time with minor limitations and provides reasonable supporting evidence."},
            {"rating": 3, "label": "Satisfactory", "description": "Can meet required lead time but has limited supporting evidence or flexibility."},
            {"rating": 2, "label": "Needs improvement", "description": "Delivery lead time exceeds company requirements or capacity is uncertain."},
            {"rating": 1, "label": "Poor", "description": "Cannot meet required lead time and has no reliable delivery plan."}
          ]'::jsonb
        )
      ELSE c END
      ORDER BY ord
    )
    FROM jsonb_array_elements(cur."criteria") WITH ORDINALITY AS e(c, ord)
  ),
  cur."bands",
  'Delivery Reliability replaced by Delivery Capability & Commitment, rated on lead time, capacity and delivery references.'
FROM cur;
