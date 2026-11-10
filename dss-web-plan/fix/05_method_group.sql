-- =============================================================================
-- 05_method_group.sql — Nhóm phương thức (method_group) & cờ is_forecastable
-- Chạy SAU 02_method_aware_cutoff.sql và etl/generated/parts/03_part_*.sql.
-- Chạy lại mỗi khi nạp lại fact_cutoff_forecast (idempotent).
--
--   GROUP_THPT      1  Điểm thi THPT / quy đổi chung              (thang 30, 40)
--   GROUP_HOCBA     2  Học bạ                                      (thang 30)
--   GROUP_EXAM      3  Kỳ thi độc lập: HSA 150, TSA 100, SPT, SAT, V-ACT 1200...
--   GROUP_COMBINED  4  Kết hợp (chứng chỉ, ưu tiên, xét tuyển thẳng...) → chỉ lịch sử
--   GROUP_TALENT    5  Năng khiếu / tài năng / hồ sơ năng lực      → không dự báo
--
-- Tách chuỗi theo thang gốc: series_key = chương trình | phương thức | tổ hợp | THANG;
-- KHÔNG quy đổi HSA/TSA/... về thang 30. Các view v_check_* cuối file kiểm chứng điều này.
-- =============================================================================

-- 1) ALTER TABLE -----------------------------------------------------------------
alter table public.fact_cutoff_forecast
  add column if not exists method_group    text,
  add column if not exists is_forecastable boolean;

alter table public.fact_cutoff_forecast drop constraint if exists chk_fcf_method_group;
alter table public.fact_cutoff_forecast add  constraint chk_fcf_method_group check (
  method_group is null or method_group in
  ('GROUP_THPT', 'GROUP_HOCBA', 'GROUP_EXAM', 'GROUP_COMBINED', 'GROUP_TALENT'));

comment on column public.fact_cutoff_forecast.method_group is
  'Nhóm phương thức (5 nhóm). Phân loại theo từ khóa admission_method/exam_type/tổ hợp — khớp method_family.';
comment on column public.fact_cutoff_forecast.is_forecastable is
  'TRUE = chuỗi được phép chạy NAIVE/MA2/Holt. FALSE với nhóm 4, 5, chuỗi thiếu dữ liệu hoặc đã ngừng.';

-- 2) UPDATE: phân loại theo từ khóa ----------------------------------------------
-- Thứ tự WHEN quan trọng: năng khiếu > kết hợp > THPT > học bạ > kỳ thi độc lập.
-- Phân loại theo CHUỖI: chỉ cần một năm của chuỗi có môn năng khiếu (vd. SPH 2023 'M00')
-- là cả chuỗi thuộc GROUP_TALENT — để một chuỗi không bị cắt làm hai nhóm.
with row_group as (
  select f.forecast_id, f.series_key, case
    -- Nhóm 5: tổ hợp có môn năng khiếu (H/M/N/S/T/V + 2 số) hoặc phương thức tài năng/hồ sơ
    when f.subject_combination ~ '(^|[^A-Z])[HMNSTV][0-9]{2}([^0-9]|$)'
      or f.subject_combination ilike '%năng khiếu%'
      or f.admission_method ~* '(HSNL|NANG_KHIEU|TALENT|PHONG_VAN)'
      or f.exam_type in ('XTTN', 'HO_SO_NANG_LUC')                         then 'GROUP_TALENT'
    -- Nhóm 4: kết hợp nhiều tiêu chí / chứng chỉ / tuyển thẳng
    when f.admission_method ~* '(KET_HOP|KETHOP|COMBINED|CCNN|CCQT|XTTH)'
      or f.exam_type in ('KET_HOP', 'CCQT')                                then 'GROUP_COMBINED'
    -- Nhóm 1: điểm thi tốt nghiệp THPT
    when f.admission_method ~* '(^THPT|TOT_NGHIEP|QUY_DOI_CHUNG)'          then 'GROUP_THPT'
    -- Nhóm 2: học bạ
    when f.admission_method ~* '(HOC_BA|HOCBA)'                            then 'GROUP_HOCBA'
    -- Nhóm 3: kỳ thi riêng / đánh giá năng lực / tư duy
    when f.admission_method ~* '(HSA|TSA|SPT|SAT|ACT|DGNL|DGTD|APT)'
      or f.exam_type in ('HSA', 'TSA', 'SPT', 'SAT', 'V-ACT')              then 'GROUP_EXAM'
    else 'GROUP_COMBINED'                                   -- không nhận diện được → không dự báo
  end as g
  from public.fact_cutoff_forecast f
),
series_group as (
  select series_key, bool_or(g = 'GROUP_TALENT') as any_talent
  from row_group
  group by series_key
)
update public.fact_cutoff_forecast f
set method_group = case when s.any_talent then 'GROUP_TALENT' else r.g end
from row_group r
join series_group s using (series_key)
where f.forecast_id = r.forecast_id;

-- Chuỗi được phép dự báo: nhóm 1–3 VÀ trạng thái chuỗi cho phép (đủ năm, còn áp dụng, thang đã xác nhận).
update public.fact_cutoff_forecast f set is_forecastable =
      f.method_group in ('GROUP_THPT', 'GROUP_HOCBA', 'GROUP_EXAM')
  and coalesce(f.forecast_status in ('OK', 'CAUTION'), false)
  and f.score_scale is not null;

create index if not exists idx_fcf_group_scale
  on public.fact_cutoff_forecast (method_group, score_scale, is_forecastable);

-- 3) KIỂM CHỨNG (mỗi view kỳ vọng 0 dòng) ----------------------------------------
-- 3a. Từ khóa phải khớp method_family do ETL gán.
create or replace view public.v_check_method_group as
select series_key, admission_method, exam_type, subject_combination, method_family, method_group
from public.fact_cutoff_forecast
where method_group is distinct from
      (array['GROUP_THPT','GROUP_HOCBA','GROUP_EXAM','GROUP_COMBINED','GROUP_TALENT'])[method_family];

-- 3b. Một chuỗi chỉ có MỘT thang điểm (không trộn HSA 150 với TSA 100 hay THPT 30).
create or replace view public.v_check_series_single_scale as
select series_key, array_agg(distinct score_scale) as scales
from public.fact_cutoff_forecast
group by series_key
having count(distinct score_scale) > 1;

-- 3c. Thang gốc đúng với kỳ thi: HSA 150, TSA 100, THPT/quy đổi 30 hoặc 40 (môn nhân đôi).
--     HSA/TSA thang 30 = điểm DO TRƯỜNG TỰ CÔNG BỐ đã quy đổi → hợp lệ, nhưng là chuỗi riêng
--     (series_key khác), không ghép với chuỗi thang 150/100.
create or replace view public.v_check_exam_scale as
select distinct series_key, exam_type, score_scale
from public.fact_cutoff_forecast
where (exam_type = 'HSA' and score_scale not in (150, 30))
   or (exam_type = 'TSA' and score_scale not in (100, 30))
   or (exam_type in ('THPT', 'QUY_DOI_CHUNG') and score_scale not in (30, 40));

-- 3d. forecast_cutoff_30 chỉ được có ở thang 30/40 — không tự quy đổi chéo thang.
create or replace view public.v_check_no_cross_scale as
select forecast_id, series_key, score_scale, forecast_cutoff_30
from public.fact_cutoff_forecast
where forecast_cutoff_30 is not null and score_scale not in (30, 40);

-- Kiểm tra nhanh:
--   select method_group, score_scale, is_forecastable,
--          count(distinct series_key) as chuoi, count(distinct program_id) as nganh
--   from fact_cutoff_forecast group by 1, 2, 3 order by 1, 2, 3;
--
--   select (select count(*) from v_check_method_group)        as sai_nhom,
--          (select count(*) from v_check_series_single_scale) as tron_thang,
--          (select count(*) from v_check_exam_scale)          as sai_thang_ky_thi,
--          (select count(*) from v_check_no_cross_scale)      as quy_doi_cheo;  -- kỳ vọng 0, 0, 0, 0
