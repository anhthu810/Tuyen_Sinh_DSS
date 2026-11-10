-- =============================================================================
-- 06_forecast_filter.sql — Danh mục trường & lọc dự báo điểm chuẩn với điều kiện động
-- Chạy SAU 02_method_aware_cutoff.sql và etl/generated/parts/03_part_*.sql.
--
-- Web app KHÔNG phụ thuộc file này: /api/v1/schools và /api/v1/forecasts dựng cùng
-- điều kiện bằng supabase-js (web/src/lib/queries/forecast-search.ts). File này để
-- gọi trực tiếp từ SQL / BI / client khác (supabase.rpc('search_forecast_series', …)).
--
-- Quy ước tham số: NULL hoặc 'ALL' (không phân biệt hoa thường) → bỏ điều kiện đó.
-- =============================================================================

-- 1) Danh mục trường (chỉ trường đang có ngành) ------------------------------------
create or replace view public.v_school_catalog as
select u.university_code as code,
       u.university_name as name,
       u.short_name
from public.dim_university u
where exists (select 1 from public.dim_program p where p.university_code = u.university_code)
order by coalesce(u.short_name, u.university_code);

-- 2) Lọc chuỗi dự báo ------------------------------------------------------------
-- Một dòng kết quả = một chuỗi (series_key). Nhóm phương thức suy từ method_family
-- (1..5 ↔ GROUP_THPT..GROUP_TALENT) nên chạy được cả khi chưa có 05_method_group.sql.
create or replace function public.search_forecast_series(
  p_school_code  text    default null,   -- 'BKA' | 'ALL' | null
  p_method_group text    default null,   -- 'GROUP_THPT' | ... | 'ALL' | null
  p_score_scale  numeric default null,   -- 30 | 40 | 100 | 150 | ... | null (= ALL)
  p_model_type   text    default null,   -- 'MA2' | 'NAIVE' | 'HOLT' | 'ALL' | null
  p_keyword      text    default null    -- tên ngành / mã ngành (ILIKE, có dấu)
)
returns table (
  series_key          text,
  program_id          text,
  major_name          text,
  university_code     text,
  method_group        text,
  admission_method    text,
  exam_type           text,
  subject_combination text,
  score_scale         numeric,
  forecast_status     text,
  is_primary          boolean,
  latest_year         integer,
  latest_actual       numeric,
  target_year         integer,
  forecast_naive      numeric,
  forecast_ma2        numeric,
  forecast_holt       numeric
)
language sql stable parallel safe as $$
  with params as (
    select nullif(upper(trim(p_school_code)),  'ALL')               as school,
           nullif(upper(trim(p_method_group)), 'ALL')               as grp,
           p_score_scale                                             as scale,
           nullif(upper(trim(p_model_type)),   'ALL')               as model,
           nullif(trim(p_keyword), '')                               as kw
  ),
  f as (
    select f.*
    from public.fact_cutoff_forecast f
    cross join params p
    left join public.dim_program d on d.program_id = f.program_id
    where (p.school is null or f.university_code = p.school)
      and (p.grp    is null or f.method_family =
             array_position(array['GROUP_THPT','GROUP_HOCBA','GROUP_EXAM','GROUP_COMBINED','GROUP_TALENT'], p.grp))
      and (p.scale  is null or f.score_scale = p.scale)
      and (p.kw     is null or d.major_name ilike '%' || p.kw || '%'
                            or d.major_code ilike '%' || p.kw || '%'
                            or f.program_id ilike '%' || p.kw || '%')
  ),
  s as (
    select f.series_key,
           min(f.program_id)                                    as program_id,
           min(f.university_code)                               as university_code,
           min(f.method_family)                                 as method_family,
           min(f.admission_method)                              as admission_method,
           min(f.exam_type)                                     as exam_type,
           max(f.score_scale)                                   as score_scale,
           min(f.forecast_status)                               as forecast_status,
           bool_or(coalesce(f.is_primary, false))               as is_primary,
           max(f.target_year) filter (where f.method = 'ACTUAL' and f.actual_cutoff is not null) as latest_year,
           max(f.target_year) filter (where f.method <> 'ACTUAL' and f.actual_cutoff is null)    as target_year
    from f
    group by f.series_key
  )
  select s.series_key,
         s.program_id,
         d.major_name,
         s.university_code,
         (array['GROUP_THPT','GROUP_HOCBA','GROUP_EXAM','GROUP_COMBINED','GROUP_TALENT'])[s.method_family],
         s.admission_method,
         s.exam_type,
         la.subject_combination,
         s.score_scale,
         s.forecast_status,
         s.is_primary,
         s.latest_year,
         la.actual_cutoff,
         s.target_year,
         nx.naive,
         nx.ma2,
         nx.holt
  from s
  cross join params p
  left join public.dim_program d on d.program_id = s.program_id
  left join lateral (
    select f.actual_cutoff, f.subject_combination
    from public.fact_cutoff_forecast f
    where f.series_key = s.series_key and f.method = 'ACTUAL' and f.target_year = s.latest_year
    limit 1
  ) la on true
  left join lateral (
    select max(f.forecast_cutoff) filter (where f.method like 'NAIVE%') as naive,
           max(f.forecast_cutoff) filter (where f.method like 'MA2%')   as ma2,
           max(f.forecast_cutoff) filter (where f.method like 'HOLT%')  as holt
    from public.fact_cutoff_forecast f
    where f.series_key = s.series_key and f.target_year = s.target_year and f.actual_cutoff is null
  ) nx on true
  where p.model is null
     or (p.model = 'NAIVE' and nx.naive is not null)
     or (p.model = 'MA2'   and nx.ma2   is not null)
     or (p.model = 'HOLT'  and nx.holt  is not null)
  order by s.university_code, d.major_name, s.is_primary desc, s.method_family, s.score_scale;
$$;

grant select  on public.v_school_catalog to anon, authenticated;
grant execute on function public.search_forecast_series(text, text, numeric, text, text) to anon, authenticated;

-- Index hỗ trợ (idx_forecast_series (series_key, target_year) đã có ở 02):
create index if not exists idx_fcf_filter
  on public.fact_cutoff_forecast (university_code, method_family, score_scale);

-- Ví dụ:
--   select * from v_school_catalog;
--   select * from search_forecast_series();                                     -- tất cả
--   select * from search_forecast_series('BKA', 'GROUP_THPT', 30, 'HOLT', null);
--   select * from search_forecast_series('ALL', 'GROUP_EXAM', 150, 'ALL', 'máy tính');
