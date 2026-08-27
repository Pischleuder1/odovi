-- Entirely synthetic operator-owned archive. Seed via the documented database seam.
insert into vehicles (display_name, source, source_id, efficiency_override_kwh_per_km)
values ('Synthetic upgrade Tesla', 'acceptance', 'upgrade-car', 0.154);
insert into places (name, type, lat, lon, address, electricity_price_per_kwh, electricity_price_currency)
values ('Upgrade home', 'home', 48.0, 9.0, 'Synthetic home', 0.31, 'EUR');
insert into tags (name, color, category) values ('Upgrade tag', '#008877', 'work');
insert into classification_rules (name, start_place_id, classification, tag_id, purpose, customer, project)
values ('Upgrade rule', 1, 'business', 1, 'Upgrade purpose', 'Synthetic customer', 'Upgrade project');
insert into drives (vehicle_id, start_time, end_time, start_lat, start_lon, end_lat, end_lon,
 start_place_id, start_place_locked, start_odometer_km, end_odometer_km, distance_km, duration_seconds,
 classification, purpose, customer, project, notes, source, source_id)
values (1, '2026-07-07T08:00:00Z', '2026-07-07T09:00:00Z', 48.0, 9.0, 48.2, 9.2,
 1, true, 10000, 10042, 42, 3600, 'business', 'Upgrade purpose', 'Synthetic customer', 'Upgrade project',
 'Upgrade annotation — preserve me', 'acceptance', 'upgrade-drive');
insert into drive_tags values (1,1);
insert into route_points (drive_id, ts, lat, lon, elevation_m) values
 (1, '2026-07-07T08:00:00Z',48.0,9.0,500), (1,'2026-07-07T09:00:00Z',48.2,9.2,520);
insert into charge_sessions (vehicle_id,start_time,end_time,place_id,place_locked,energy_added_kwh,cost,currency,cost_source,notes,source,source_id)
values (1,'2026-07-07T09:30:00Z','2026-07-07T10:30:00Z',1,true,10,3.10,'EUR','manual','Upgrade charge note','acceptance','upgrade-charge');
insert into charge_session_tags values (1,1);
insert into park_sessions (vehicle_id,start_time,end_time,place_id,place_locked,source,source_id)
values (1,'2026-07-07T10:30:00Z','2026-07-07T11:30:00Z',1,true,'acceptance','upgrade-park');
insert into journeys (name,type,start_time,end_time,description)
values ('Upgrade journey','roadtrip','2026-07-07T00:00:00Z','2026-07-08T00:00:00Z','Upgrade journey description');
insert into journey_items (journey_id,item_type,item_id,assigned_by,excluded,sort_order) values
 (1,'drive',1,'manual',false,1),(1,'charge',1,'manual',false,2),(1,'park',1,'manual',true,3);
insert into audit_log (entity_type,entity_id,field,old_value,new_value,changed_by)
values ('drive',1,'notes',null,'Upgrade annotation — preserve me','admin');
insert into sync_state (source,entity,watermark_ts,last_run_at,last_success_at,last_status,rows_upserted)
values ('acceptance','drives','2026-07-07T09:00:00Z','2026-07-07T09:01:00Z','2026-07-07T09:01:00Z','ok',1);
insert into settings (key,value) values ('upgrade-fixture','{"preserve":true}');
