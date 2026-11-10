-- ============================================================================
-- DSS Group 5 — 02: Điểm chuẩn & dự báo TÁCH THEO PHƯƠNG THỨC + kiểm tra quy chế
-- Chạy SAU 01_ddl_augment.sql. Chạy toàn bộ file trong Supabase → SQL Editor.
-- Idempotent (chạy lại an toàn).
--
-- Sau file này, chạy tiếp etl/generated/03_load_cutoff_forecast.sql (sinh bởi
-- etl/build_method_forecast.py) để nạp lại fact_cutoff_forecast theo chuỗi mới.
--
-- Nội dung:
--   1. fact_cutoff_score: thêm cột metadata (nhóm phương thức, kỳ thi, điểm gốc,
--      điểm quy đổi có căn cứ, ngưỡng đầu vào, nguồn, quy chế áp dụng).
--   2. ref_regulation_version, ref_min_eligibility_score: bảng tham chiếu quy chế.
--   3. fact_cutoff_forecast: thêm khóa chuỗi (trường + ngành + phương thức +
--      tổ hợp + thang điểm) và trạng thái dự báo.
--   4. Hàm quy tắc: điểm ưu tiên giảm dần, trần điểm cộng 10%.
--   5. View kiểm tra quy chế (v_check_*) — DSS hiển thị cảnh báo, không tự sửa dữ liệu.
-- ============================================================================

begin;

-- ----------------------------------------------------------------------------
-- 1) BẢNG THAM CHIẾU QUY CHẾ
-- ----------------------------------------------------------------------------
-- Quy chế áp dụng cho từng năm tuyển sinh. Nhãn dùng để đánh dấu điểm gãy chính
-- sách trong chuỗi thời gian (không mặc định 2023–2026 đồng nhất).
-- Nhóm cần đối chiếu lại văn bản gốc trước khi chốt báo cáo (verified = false).
create table if not exists public.ref_regulation_version (
  admission_year      integer primary key,
  regulation_version  text    not null,
  effective_note      text,
  verified            boolean not null default false
);

insert into public.ref_regulation_version (admission_year, regulation_version, effective_note, verified) values
  (2023, 'TT08/2022', 'Quy chế tuyển sinh ban hành kèm TT 08/2022/TT-BGDĐT', false),
  (2024, 'TT08/2022', 'Quy chế tuyển sinh ban hành kèm TT 08/2022/TT-BGDĐT', false),
  (2025, 'TT06/2025', 'Sửa đổi 2025: quy đổi tương đương giữa phương thức, nhiều trường dùng điểm chuẩn chung', false),
  (2026, 'QC-2026',   'Quy chế mới từ 2026: tối đa 5 phương thức, ngưỡng nguồn tuyển THPT 15/30, trần điểm cộng 10%', false),
  (2027, 'QC-2026',   'GIẢ ĐỊNH tiếp tục QC-2026 — cập nhật theo đề án tuyển sinh 2027 chính thức của từng trường', false)
on conflict (admission_year) do nothing;

-- Ngưỡng đầu vào (ngưỡng đảm bảo chất lượng / nguồn tuyển). KHÁC điểm chuẩn
-- trúng tuyển. scope:
--   'THPT_ALL'         ngưỡng nguồn tuyển chung cho phương thức điểm thi THPT
--   'HEALTH_LICENSED'  ngành sức khỏe có cấp giấy phép hành nghề
--   'TEACHER'          ngành đào tạo giáo viên
--   'MAJOR'            ngưỡng riêng cho 1 mã ngành (major_code)
-- Chỉ seed ngưỡng chung 2026 theo tài liệu của nhóm. Ngưỡng khối sức khỏe / sư
-- phạm do Bộ công bố hằng năm → nhóm nhập từ thông báo chính thức (verified=true).
create table if not exists public.ref_min_eligibility_score (
  id                 bigint generated always as identity primary key,
  admission_year     integer not null,
  scope              text    not null
      check (scope in ('THPT_ALL','HEALTH_LICENSED','TEACHER','MAJOR')),
  major_code         text,                 -- chỉ dùng khi scope = 'MAJOR'
  min_score          numeric not null,
  score_scale        integer not null default 30,
  source_url         text,
  verified           boolean not null default false,
  note               text,
  unique (admission_year, scope, major_code)
);

insert into public.ref_min_eligibility_score (admission_year, scope, major_code, min_score, score_scale, note)
select 2026, 'THPT_ALL', null, 15, 30, 'Ngưỡng nguồn tuyển tối thiểu 15/30 cho thí sinh thi THPT từ 2026 (theo tài liệu nhóm — cần đối chiếu văn bản)'
where not exists (
  select 1 from public.ref_min_eligibility_score
  where admission_year = 2026 and scope = 'THPT_ALL' and major_code is null
);

-- Phân loại ngành chịu ngưỡng riêng theo mã ngành Bộ GD&ĐT.
--   71402xx = đào tạo giáo viên; 7720xxx = sức khỏe, trừ Y tế công cộng
--   (7720701) và Hóa dược (7720203) — không cấp giấy phép hành nghề.
--   Danh sách loại trừ cần nhóm rà soát.
create or replace view public.v_program_sector as
select
  p.program_id,
  p.university_code,
  p.major_code,
  p.major_name,
  case
    when p.major_code like '71402%' then 'TEACHER'
    when p.major_code like '7720%'
         and p.major_code not in ('7720701','7720203') then 'HEALTH_LICENSED'
    else null
  end as regulated_sector
from public.dim_program p;


-- ----------------------------------------------------------------------------
-- 2) fact_cutoff_score — CỘT METADATA MỚI
-- ----------------------------------------------------------------------------
alter table public.fact_cutoff_score
  add column if not exists method_family            smallint,  -- 1 THPT · 2 Học bạ · 3 Kỳ thi độc lập · 4 Kết hợp · 5 Năng khiếu/tài năng/phỏng vấn
  add column if not exists exam_type                text,      -- THPT, QUY_DOI_CHUNG, HOC_BA, TSA, HSA, SPT, SAT, V-ACT, ...
  add column if not exists raw_cutoff_score         numeric,   -- điểm chuẩn theo thang gốc
  add column if not exists converted_cutoff_score   numeric,   -- điểm quy về thang 30, CHỈ khi có căn cứ
  add column if not exists conversion_rule_year     integer,   -- năm của quy tắc quy đổi đã dùng
  add column if not exists minimum_eligibility_score numeric,  -- ngưỡng đầu vào (≠ điểm trúng tuyển)
  add column if not exists cutoff_source            text,      -- nguồn công bố (Chính thức / Báo chí / Trang tổng hợp)
  add column if not exists regulation_version       text,      -- quy chế áp dụng năm đó
  add column if not exists is_admission_cutoff      boolean,   -- FALSE = ngưỡng nhận hồ sơ, không phải điểm trúng tuyển
  add column if not exists is_forecastable          boolean;   -- dòng được đưa vào chuỗi dự báo

-- Nhóm phương thức (5 nhóm của đề tài).
--   Nhóm 5 nhận diện thêm qua tổ hợp năng khiếu (H/M/N/S/T/V + 2 số, hoặc chữ "năng khiếu").
update public.fact_cutoff_score c set method_family = case
    when c.subject_combination ~ '(^|[^A-Z])[HMNSTV][0-9]{2}([^0-9]|$)'
      or c.subject_combination ilike '%năng khiếu%'               then 5
    when c.admission_method in ('XTTN_HSNL')                       then 5
    when c.admission_method = 'OTHER' and c.score_scale = 110      then 5   -- XTTN gộp
    when c.admission_method in ('THPT','QUY_DOI_CHUNG')            then 1
    when c.admission_method = 'HOC_BA'                             then 2
    when c.admission_method in ('TSA','HSA','SPT','SAT')           then 3
    when c.admission_method = 'OTHER' and c.score_scale = 1200     then 3   -- V-ACT
    when c.admission_method in ('KET_HOP_XT','KET_HOP_CCNN','XTTH','XTTN_CCQT') then 4
    else 4
  end;

update public.fact_cutoff_score c set exam_type = case
    when c.admission_method = 'OTHER' and c.score_scale = 1200 then 'V-ACT'
    when c.admission_method = 'OTHER' and c.score_scale = 110  then 'XTTN'
    when c.admission_method = 'OTHER'                          then 'OTHER'
    when c.admission_method in ('KET_HOP_XT','KET_HOP_CCNN')   then 'KET_HOP'
    when c.admission_method = 'XTTN_CCQT'                      then 'CCQT'
    when c.admission_method = 'XTTN_HSNL'                      then 'HO_SO_NANG_LUC'
    else c.admission_method
  end;

update public.fact_cutoff_score c set
  raw_cutoff_score       = c.cutoff_score,
  -- Chỉ quy đổi khi có căn cứ: thang 30 giữ nguyên; thang 40 (1 môn hệ số 2) ×3/4
  -- theo đúng cách trường công bố năm đó. TSA/HSA/SAT/... KHÔNG tự quy về 30.
  converted_cutoff_score = case when c.score_scale in (30, 40) and c.scale_confirmed
                                then c.cutoff_score_30 end,
  conversion_rule_year   = case when c.score_scale = 40 and c.scale_confirmed
                                then c.admission_year end,
  cutoff_source          = c.source_type,
  regulation_version     = r.regulation_version,
  -- README v5: HVN 2024 học bạ/KET_HOP_XT là ngưỡng nhận hồ sơ, không phải điểm trúng tuyển.
  is_admission_cutoff    = not (c.university_code = 'HVN' and c.admission_year = 2024
                                and c.admission_method in ('HOC_BA','KET_HOP_XT'))
from public.ref_regulation_version r
where r.admission_year = c.admission_year;

-- Ngưỡng đầu vào: lấy mức cao nhất đang áp dụng (ngưỡng ngành > ngưỡng khối > ngưỡng chung).
-- Chỉ gán cho phương thức điểm thi THPT / quy đổi chung trên thang 30.
update public.fact_cutoff_score c set minimum_eligibility_score = t.min_score
from (
  select c2.cutoff_id, max(m.min_score) as min_score
  from public.fact_cutoff_score c2
  join public.v_program_sector s on s.program_id = c2.program_id
  join public.ref_min_eligibility_score m
    on m.admission_year = c2.admission_year
   and m.score_scale = 30
   and (   m.scope = 'THPT_ALL'
        or (m.scope = s.regulated_sector)
        or (m.scope = 'MAJOR' and m.major_code = s.major_code))
  where c2.method_family = 1 and c2.score_scale = 30
  group by c2.cutoff_id
) t
where t.cutoff_id = c.cutoff_id;

-- Dòng được đưa vào chuỗi dự báo (khớp quy tắc trong etl/build_method_forecast.py):
--   nhóm 1–3, có điểm, thang đã xác nhận, là điểm trúng tuyển thật.
update public.fact_cutoff_score c set is_forecastable =
      c.method_family in (1, 2, 3)
  and c.cutoff_score is not null
  and not c.is_missing
  and c.scale_confirmed
  and c.is_admission_cutoff;

create index if not exists idx_fcs_series
  on public.fact_cutoff_score (program_id, admission_method, subject_combination, score_scale, admission_year);


-- ----------------------------------------------------------------------------
-- 3) fact_cutoff_forecast — KHÓA CHUỖI & TRẠNG THÁI
-- ----------------------------------------------------------------------------
-- KPI mới: forecast_cutoff theo trường + ngành + phương thức + tổ hợp + thang + năm.
-- method nhận: 'ACTUAL' (điểm thực tế của chuỗi), 'NAIVE (năm trước)',
--              'MA2 (TB 2 năm trước)', 'HOLT (α=0.5, β=0.3)'.
alter table public.fact_cutoff_forecast
  add column if not exists series_key            text,
  add column if not exists admission_method      text,
  add column if not exists exam_type             text,
  add column if not exists method_family         smallint,
  add column if not exists subject_combination   text,
  add column if not exists score_scale           numeric,
  add column if not exists forecast_cutoff_30    numeric,   -- chỉ khi thang 30/40
  add column if not exists n_history_years       integer,   -- số năm lịch sử dùng cho dòng dự báo này
  add column if not exists forecast_status       text,      -- trạng thái của CHUỖI (xem dưới)
  add column if not exists status_reason         text,
  add column if not exists crosses_policy_change boolean,   -- dữ liệu dùng để dự báo trải qua > 1 quy chế
  add column if not exists regulation_version    text,      -- quy chế của target_year
  add column if not exists is_primary            boolean;   -- chuỗi THPT/quy đổi chung thang 30 dùng cho tư vấn theo điểm thi

alter table public.fact_cutoff_forecast drop constraint if exists fcf_status_chk;
alter table public.fact_cutoff_forecast add constraint fcf_status_chk check (
  forecast_status is null or forecast_status in (
    'OK',                    -- đủ dữ liệu, phương thức còn áp dụng
    'CAUTION',               -- có dự báo nhưng cần thận trọng (học bạ chưa rõ công thức, độ tin cậy thấp)
    'INSUFFICIENT_HISTORY',  -- < 2 năm dữ liệu: chỉ hiển thị lịch sử
    'DISCONTINUED',          -- phương thức không còn công bố ở năm dữ liệu mới nhất
    'NOT_FORECASTED'         -- nhóm 4/5, thang chưa xác nhận hoặc không phải điểm trúng tuyển
  ));

create index if not exists idx_forecast_series  on public.fact_cutoff_forecast (series_key, target_year);
create index if not exists idx_forecast_primary on public.fact_cutoff_forecast (program_id) where is_primary;


-- ----------------------------------------------------------------------------
-- 4) HÀM QUY TẮC
-- ----------------------------------------------------------------------------
-- Điểm ưu tiên thực hưởng: giữ nguyên khi tổng điểm (chưa cộng ưu tiên, thang 30)
-- < 22,5; từ 22,5 trở lên giảm tuyến tính: ((30 − tổng) / 7,5) × mức ưu tiên.
create or replace function public.fn_effective_priority_bonus(base_bonus numeric, raw_total_30 numeric)
returns numeric language sql immutable as $$
  select case
    when base_bonus is null or raw_total_30 is null then null
    when raw_total_30 < 22.5 then base_bonus
    else round(greatest(0, (30 - raw_total_30) / 7.5) * base_bonus, 2)
  end;
$$;

-- Trần tổng điểm cộng (thưởng / xét thưởng / khuyến khích) = 10% thang xét tuyển.
create or replace function public.fn_bonus_cap(score_scale numeric)
returns numeric language sql immutable as $$
  select case when score_scale is null then null else round(score_scale * 0.10, 2) end;
$$;


-- ----------------------------------------------------------------------------
-- 5) VIEW KIỂM TRA QUY CHẾ (DSS đọc để hiển thị cảnh báo)
-- ----------------------------------------------------------------------------

-- 5a. Số phương thức có điểm chuẩn mỗi trường/năm. Từ 2026 tối đa 5 (không tính
--     xét tuyển thẳng/ưu tiên xét tuyển và điểm chuẩn chung QUY_DOI_CHUNG — không
--     phải một phương thức riêng). Lưu ý: đếm theo điểm chuẩn đã công bố trong gói
--     dữ liệu, chưa phải theo đề án tuyển sinh đầy đủ.
create or replace view public.v_check_method_count as
select
  c.university_code,
  c.admission_year,
  count(distinct c.admission_method) filter (
    where c.admission_method not in ('QUY_DOI_CHUNG','XTTN_CCQT','XTTN_HSNL','TUYEN_THANG')
  ) as n_methods_counted,
  array_agg(distinct c.admission_method order by c.admission_method) as methods,
  (c.admission_year >= 2026) as rule_applies,
  case
    when c.admission_year >= 2026
     and count(distinct c.admission_method) filter (
           where c.admission_method not in ('QUY_DOI_CHUNG','XTTN_CCQT','XTTN_HSNL','TUYEN_THANG')
         ) > 5
    then 'VƯỢT 5 PHƯƠNG THỨC' else 'OK'
  end as check_result
from public.fact_cutoff_score c
group by c.university_code, c.admission_year;

-- 5b. Điểm cộng ngầm định trên từng NV × phương thức:
--     final − raw − priority = phần điểm thưởng/khuyến khích. Vượt 10% thang → cảnh báo.
--     Bỏ qua dòng quy đổi từ TSA/HSA (raw ở thang gốc khác).
create or replace view public.v_check_bonus_cap as
select
  m.app_method_id,
  m.application_id,
  m.admission_method,
  m.score_scale,
  m.raw_score,
  m.priority_bonus,
  m.final_score,
  round(m.final_score - m.raw_score - coalesce(m.priority_bonus, 0), 2) as implied_bonus,
  public.fn_bonus_cap(m.score_scale) as bonus_cap,
  case
    when m.final_score - m.raw_score - coalesce(m.priority_bonus, 0)
         > public.fn_bonus_cap(m.score_scale) + 0.005
    then 'VƯỢT TRẦN 10%' else 'OK'
  end as check_result
from public.fact_application_method m
where m.raw_score is not null and m.final_score is not null and m.converted_from is null;

-- 5c. Điểm ưu tiên đã áp dụng có khớp công thức giảm dần không (thang 30, THPT).
create or replace view public.v_check_priority_bonus as
select
  m.app_method_id,
  md.student_id,
  m.raw_score,
  s.priority_bonus_base,
  m.priority_bonus as applied_bonus,
  public.fn_effective_priority_bonus(s.priority_bonus_base, m.raw_score) as expected_bonus,
  case
    when m.priority_bonus > public.fn_effective_priority_bonus(s.priority_bonus_base, m.raw_score) + 0.01
    then 'ƯU TIÊN CAO HƠN CÔNG THỨC' else 'OK'
  end as check_result
from public.fact_application_method m
join public.main_dataset md on md.application_id = m.application_id
join public.dim_student  s  on s.student_id = md.student_id
where m.admission_method = 'THPT' and m.score_scale = 30 and m.raw_score is not null;

-- 5d. Ngưỡng đầu vào vs điểm chuẩn — hai chỉ số KHÁC NHAU.
--     Cảnh báo: (i) ngành sức khỏe/sư phạm chưa có ngưỡng khối trong ref,
--               (ii) điểm chuẩn thấp hơn ngưỡng đầu vào (dữ liệu nghi sai).
create or replace view public.v_check_eligibility_threshold as
select
  c.cutoff_id,
  c.program_id,
  s.major_name,
  s.regulated_sector,
  c.admission_year,
  c.admission_method,
  c.cutoff_score,
  c.minimum_eligibility_score,
  case
    when c.minimum_eligibility_score is not null and c.cutoff_score < c.minimum_eligibility_score
      then 'ĐIỂM CHUẨN < NGƯỠNG ĐẦU VÀO'
    when s.regulated_sector is not null and not exists (
           select 1 from public.ref_min_eligibility_score m
           where m.admission_year = c.admission_year
             and (m.scope = s.regulated_sector or (m.scope = 'MAJOR' and m.major_code = s.major_code)))
      then 'THIẾU NGƯỠNG KHỐI ' || s.regulated_sector
    else 'OK'
  end as check_result
from public.fact_cutoff_score c
join public.v_program_sector s on s.program_id = c.program_id
where c.method_family = 1 and c.score_scale = 30;

-- 5e. Tóm tắt toàn bộ cảnh báo (trang Chất lượng dữ liệu đọc view này).
create or replace view public.v_regulation_check_summary as
select 'Tối đa 5 phương thức (từ 2026)' as rule_name, check_result, count(*) as n_rows
  from public.v_check_method_count where rule_applies group by check_result
union all
select 'Trần điểm cộng 10% thang điểm', check_result, count(*)
  from public.v_check_bonus_cap group by check_result
union all
select 'Điểm ưu tiên giảm dần từ 22,5', check_result, count(*)
  from public.v_check_priority_bonus group by check_result
union all
select 'Ngưỡng đầu vào ≠ điểm chuẩn', check_result, count(*)
  from public.v_check_eligibility_threshold group by check_result;

-- Quyền đọc công khai cho bảng/view mới (giống 01_ddl_augment.sql).
do $$
declare t text;
begin
  foreach t in array array['ref_regulation_version','ref_min_eligibility_score'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('grant select on public.%I to anon, authenticated;', t);
    execute format('drop policy if exists public_read on public.%I;', t);
    execute format('create policy public_read on public.%I for select to anon, authenticated using (true);', t);
  end loop;
  foreach t in array array['v_program_sector','v_check_method_count','v_check_bonus_cap',
                           'v_check_priority_bonus','v_check_eligibility_threshold',
                           'v_regulation_check_summary'] loop
    execute format('grant select on public.%I to anon, authenticated;', t);
  end loop;
end $$;

commit;

-- Kiểm tra nhanh:
--   select method_family, count(*) from fact_cutoff_score group by 1 order by 1;
--   select * from v_regulation_check_summary order by 1, 2;
--   select * from v_check_method_count where rule_applies order by 1;
