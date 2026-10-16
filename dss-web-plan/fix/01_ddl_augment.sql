-- ============================================================================
-- DSS Group 5 — Bổ sung DB Supabase (giữ thiết kế hiện tại, lấp lỗ hổng)
-- Chạy TOÀN BỘ file này 1 lần trong Supabase → SQL Editor → Run.
-- An toàn chạy lại (idempotent). Sau khi chạy xong, báo Claude để nạp dữ liệu
-- (fact_cutoff_forecast 1826, fact_application_method 4587, 8 dòng cutoff năng khiếu).
-- ============================================================================

begin;

-- 1) SỬA cột quá ngắn: subject_combination đang varchar(50), có tổ hợp năng khiếu tới 69 ký tự
alter table public.fact_cutoff_score
  alter column subject_combination type text;

-- 2) TẠO bảng fact_cutoff_forecast (dự báo điểm chuẩn — phục vụ Q2 / K03)
create table if not exists public.fact_cutoff_forecast (
  forecast_id     text primary key,
  program_id      text not null references public.dim_program(program_id)   on update cascade on delete restrict,
  university_code text not null references public.dim_university(university_code) on update cascade on delete restrict,
  target_year     integer not null,
  forecast_date   date,
  method          text,          -- 'NAIVE (năm trước)' | 'MA2 (TB 2 năm trước)'
  forecast_cutoff numeric,
  actual_cutoff   numeric,        -- null với năm chưa có kết quả
  error           numeric,
  abs_error       numeric,
  created_at      timestamptz default now()
);
create index if not exists idx_forecast_program on public.fact_cutoff_forecast(program_id);
create index if not exists idx_forecast_year    on public.fact_cutoff_forecast(target_year);

-- 3) TẠO bảng fact_application_method (NV × phương thức — phục vụ Q1 / K02 chi tiết)
--    application_id tham chiếu main_dataset (bảng NV phẳng hiện có); cutoff_id có thể NULL (TUYEN_THANG)
create table if not exists public.fact_application_method (
  app_method_id   text primary key,
  application_id  text not null references public.main_dataset(application_id)  on update cascade on delete cascade,
  cutoff_id       text references public.fact_cutoff_score(cutoff_id)           on update cascade on delete set null,
  admission_method text,
  combination_used text,
  raw_score       numeric,
  priority_bonus  numeric,
  final_score     numeric,
  score_scale     numeric,
  cutoff_score    numeric,
  score_margin    numeric,
  score_margin_30 numeric,
  is_eligible     boolean,
  converted_from  text,
  created_at      timestamptz default now()
);
create index if not exists idx_am_application on public.fact_application_method(application_id);
create index if not exists idx_am_cutoff      on public.fact_application_method(cutoff_id);

-- 4) BỔ SUNG khóa ngoại còn thiếu (dọn dữ liệu bẩn trước khi thêm)
--    4a. fact_quota.program_id có giá trị '' (chỉ tiêu toàn trường) → đưa về NULL rồi gắn FK
alter table public.fact_quota alter column program_id drop not null;
update public.fact_quota set program_id = null where program_id = '';
alter table public.fact_quota drop constraint if exists fk_quota_program;
alter table public.fact_quota
  add constraint fk_quota_program foreign key (program_id)
  references public.dim_program(program_id) on update cascade on delete restrict;

--    4b. fact_exam_score.student_id → dim_student (0 orphan)
alter table public.fact_exam_score drop constraint if exists fk_exam_student;
alter table public.fact_exam_score
  add constraint fk_exam_student foreign key (student_id)
  references public.dim_student(student_id) on update cascade on delete cascade;

--    4c. main_dataset.student_id → dim_student (0 orphan)
alter table public.main_dataset drop constraint if exists fk_main_student;
alter table public.main_dataset
  add constraint fk_main_student foreign key (student_id)
  references public.dim_student(student_id) on update cascade on delete cascade;

-- 5) RLS: bật + policy ĐỌC CÔNG KHAI cho anon/authenticated (dữ liệu tham khảo công khai)
--    Ghi (insert/update/delete) KHÔNG mở cho anon → chỉ service_role (bypass RLS) ghi được.
do $$
declare t text;
begin
  foreach t in array array[
    'dim_university','dim_program','dim_student',
    'fact_exam_score','fact_cutoff_score','fact_quota','fact_tuition',
    'fact_employment','fact_labor_demand','fact_salary','main_dataset',
    'fact_cutoff_forecast','fact_application_method'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('grant select on public.%I to anon, authenticated;', t);
    execute format('drop policy if exists public_read on public.%I;', t);
    execute format('create policy public_read on public.%I for select to anon, authenticated using (true);', t);
  end loop;
end $$;

commit;

-- Kiểm tra nhanh sau khi chạy:
--   select count(*) from public.fact_cutoff_score;      -- kỳ vọng 2931 (sẽ thành 2939 sau khi Claude nạp 8 dòng)
--   select to_regclass('public.fact_cutoff_forecast');  -- không null = đã tạo
--   select to_regclass('public.fact_application_method');
