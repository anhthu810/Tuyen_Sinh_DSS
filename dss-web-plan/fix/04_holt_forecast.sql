-- =============================================================================
-- 04_holt_forecast.sql — Holt's Linear Trend trong Postgres (Supabase)
-- Chạy SAU 02_method_aware_cutoff.sql và các file etl/generated/parts/03_part_*.sql.
--
-- Lưu ý thiết kế: fact_cutoff_forecast lưu DẠNG DÀI (mỗi mô hình 1 dòng, method =
-- 'ACTUAL' | 'NAIVE (...)' | 'MA2 (...)' | 'HOLT (α=0.6, β=0.2)'), không có cột
-- forecast_holt. Lịch sử của chuỗi = các dòng method='ACTUAL' cùng series_key
-- (series_key = trường+ngành | phương thức | tổ hợp | thang điểm).
-- Dòng HOLT do etl/build_method_forecast.py sinh; file này cung cấp:
--   1. public.holt_forecast(numeric[], α, β)  — cùng công thức với ETL & web/src/lib/dss/holt.ts
--   2. public.v_holt_check                    — đối chiếu Holt tính bằng SQL với dòng ETL
-- =============================================================================

create or replace function public.holt_forecast(
  y     numeric[],
  alpha numeric default 0.6,
  beta  numeric default 0.2
) returns numeric
language plpgsql immutable strict parallel safe as $$
declare
  n          int := coalesce(array_length(y, 1), 0);
  lvl        numeric;
  trd        numeric;
  prev_lvl   numeric;
begin
  if n < 3 then
    return null;                       -- < 3 năm → không dự báo Holt
  end if;
  lvl := y[1];                         -- L = Y0
  trd := y[2] - y[1];                  -- T = Y1 − Y0
  for t in 2 .. n loop
    prev_lvl := lvl;
    lvl := alpha * y[t] + (1 - alpha) * (lvl + trd);
    trd := beta * (lvl - prev_lvl) + (1 - beta) * trd;
  end loop;
  return round(lvl + trd, 2);          -- Ŷ năm kế tiếp
end $$;

comment on function public.holt_forecast(numeric[], numeric, numeric) is
  'Holt linear trend 1 bước. NULL nếu < 3 điểm. Phải khớp etl/build_method_forecast.py và web/src/lib/dss/holt.ts.';

-- Đối chiếu: chỉ chuỗi được dự báo, ≥ 3 năm thực tế LIÊN TIẾP (không hổng năm).
-- Một lần quét bảng + index idx_forecast_series (series_key, target_year).
create or replace view public.v_holt_check as
with hist as (
  select series_key,
         array_agg(actual_cutoff order by target_year) as ys,
         count(*)                                       as n_years,
         max(target_year)                               as last_year
  from public.fact_cutoff_forecast
  where method = 'ACTUAL'
    and actual_cutoff is not null
    and forecast_status in ('OK', 'CAUTION')
  group by series_key
  having count(*) >= 3
     and max(target_year) - min(target_year) + 1 = count(*)
)
select h.series_key,
       h.n_years,
       h.last_year + 1                       as target_year,
       public.holt_forecast(h.ys)            as holt_sql,
       f.forecast_cutoff                     as holt_etl,
       public.holt_forecast(h.ys) - f.forecast_cutoff as diff
from hist h
left join public.fact_cutoff_forecast f
  on f.series_key  = h.series_key
 and f.target_year = h.last_year + 1
 and f.method like 'HOLT%';

-- Kiểm tra nhanh (kỳ vọng 0 dòng):
--   select * from v_holt_check where holt_etl is null or abs(diff) > 0.01;
