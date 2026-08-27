-- Database backup is the agreed operator seam. Compare complete legacy columns,
-- not implementation-dependent derived fields introduced by later migrations.
select jsonb_build_object(
 'users',(select jsonb_agg(to_jsonb(t) order by id) from users t),
 'sessions',(select jsonb_agg(to_jsonb(t) order by id) from sessions t),
 'places',(select jsonb_agg(to_jsonb(t) order by id) from places t),
 'tags',(select jsonb_agg(to_jsonb(t) order by id) from tags t),
 'rules',(select jsonb_agg(to_jsonb(t) order by id) from classification_rules t),
 'annotations',(select jsonb_agg(jsonb_build_object('id',id,'notes',notes,'classification',classification,'purpose',purpose,'customer',customer,'project',project,'start_place_id',start_place_id,'start_place_locked',start_place_locked) order by id) from drives where source='acceptance'),
 'chargeAnnotations',(select jsonb_agg(jsonb_build_object('id',id,'notes',notes,'cost',cost,'currency',currency,'cost_source',cost_source,'place_id',place_id,'place_locked',place_locked) order by id) from charge_sessions where source='acceptance'),
 'parkAnnotations',(select jsonb_agg(jsonb_build_object('id',id,'place_id',place_id,'place_locked',place_locked) order by id) from park_sessions where source='acceptance'),
 'driveTags',(select jsonb_agg(to_jsonb(t) order by drive_id,tag_id) from drive_tags t),
 'chargeTags',(select jsonb_agg(to_jsonb(t) order by charge_session_id,tag_id) from charge_session_tags t),
 'journeys',(select jsonb_agg(jsonb_build_object('id',id,'name',name,'type',type,'start_time',start_time,'end_time',end_time,'color',color,'description',description,'created_at',created_at,'updated_at',updated_at) order by id) from journeys),
 'journeyItems',(select jsonb_agg(to_jsonb(t) order by id) from journey_items t),
 'audit',(select jsonb_agg(to_jsonb(t) order by id) from audit_log t),
 'sync',(select jsonb_agg(to_jsonb(t) order by source,entity) from sync_state t where source='acceptance'),
 'settings',(select jsonb_agg(to_jsonb(t) order by key) from settings t where key='upgrade-fixture')
);
