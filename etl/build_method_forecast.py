"""
Dự báo điểm chuẩn TÁCH THEO CHUỖI phương thức — DSS Nhóm 5.

Một chuỗi = trường + ngành + phương thức + tổ hợp + thang điểm.
Không gộp THPT với học bạ, HSA, TSA, V-ACT... và không quy đổi chéo thang điểm.

Mô hình (so sánh trên cùng chuỗi):
  NAIVE  : điểm năm trước                          (cần ≥ 1 năm, chỉ để tham chiếu)
  MA2    : trung bình 2 năm liền trước              (cần ≥ 2 năm liên tiếp)
  HOLT   : san bằng mũ có xu hướng α=0.6, β=0.2      (cần ≥ 3 năm liên tiếp)

Trạng thái chuỗi (forecast_status):
  NOT_FORECASTED       nhóm 4/5, thang chưa xác nhận, hoặc không phải điểm trúng tuyển
  INSUFFICIENT_HISTORY < 2 năm dữ liệu → chỉ hiển thị lịch sử, cảnh báo chưa đủ cơ sở
  DISCONTINUED         phương thức không còn công bố ở năm dữ liệu mới nhất → không dự báo năm tới
  CAUTION              có dự báo nhưng: học bạ (chưa rõ công thức) hoặc mọi điểm có độ tin cậy "Thấp"
  OK                   còn lại

Đầu ra:
  etl/generated/03_load_cutoff_forecast.sql — chạy trong Supabase SQL Editor SAU 02_method_aware_cutoff.sql
  etl/generated/forecast_summary.txt        — thống kê chuỗi & MAE theo mô hình

Chạy:  python etl/build_method_forecast.py [đường_dẫn_xlsx]
"""

from __future__ import annotations

import collections
import datetime as dt
import re
import sys
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
XLSX = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "DSS_Group5_DataPackage_v5.xlsx"
OUT = ROOT / "etl" / "generated"

HOLT_ALPHA, HOLT_BETA = 0.6, 0.2  # khớp web/src/lib/dss/holt.ts
M_ACTUAL = "ACTUAL"
M_NAIVE = "NAIVE (năm trước)"
M_MA2 = "MA2 (TB 2 năm trước)"
M_HOLT = f"HOLT (α={HOLT_ALPHA}, β={HOLT_BETA})"

# Khớp ref_regulation_version trong 02_method_aware_cutoff.sql.
REGULATION = {2023: "TT08/2022", 2024: "TT08/2022", 2025: "TT06/2025", 2026: "QC-2026", 2027: "QC-2026"}

# Tổ hợp năng khiếu (H/M/N/S/T/V + 2 số) — khớp regex trong SQL.
APTITUDE_RE = re.compile(r"(^|[^A-Z])[HMNSTV][0-9]{2}([^0-9]|$)")


# --------------------------------------------------------------------------- rules
# Các quy tắc dưới đây PHẢI khớp bước 2 của dss-web-plan/fix/02_method_aware_cutoff.sql.

def method_family(r: dict) -> int:
    m, scale, combo = r["admission_method"], r["score_scale"], r["subject_combination"] or ""
    if APTITUDE_RE.search(combo) or "năng khiếu" in combo.lower():
        return 5
    if m == "XTTN_HSNL" or (m == "OTHER" and scale == 110):
        return 5
    if m in ("THPT", "QUY_DOI_CHUNG"):
        return 1
    if m == "HOC_BA":
        return 2
    if m in ("TSA", "HSA", "SPT", "SAT") or (m == "OTHER" and scale == 1200):
        return 3
    return 4


def exam_type(r: dict) -> str:
    m, scale = r["admission_method"], r["score_scale"]
    if m == "OTHER":
        return {1200: "V-ACT", 110: "XTTN"}.get(scale, "OTHER")
    return {
        "KET_HOP_XT": "KET_HOP", "KET_HOP_CCNN": "KET_HOP",
        "XTTN_CCQT": "CCQT", "XTTN_HSNL": "HO_SO_NANG_LUC",
    }.get(m, m)


def is_admission_cutoff(r: dict) -> bool:
    return not (r["university_code"] == "HVN" and r["admission_year"] == 2024
                and r["admission_method"] in ("HOC_BA", "KET_HOP_XT"))


def to_30(value: float | None, scale: float | None) -> float | None:
    """Chỉ quy đổi khi có căn cứ: thang 30 giữ nguyên, thang 40 ×3/4."""
    if value is None:
        return None
    if scale == 30:
        return round(value, 2)
    if scale == 40:
        return round(value * 0.75, 2)
    return None


# --------------------------------------------------------------------------- models

def naive(hist: list[float]) -> float | None:
    return hist[-1] if hist else None


def ma2(hist: list[float]) -> float | None:
    return round((hist[-1] + hist[-2]) / 2, 2) if len(hist) >= 2 else None


def holt(hist: list[float]) -> float | None:
    """Holt tuyến tính, khởi tạo level=y0, trend=y1−y0; dự báo 1 bước."""
    if len(hist) < 3:
        return None
    level, trend = hist[0], hist[1] - hist[0]
    for y in hist[1:]:
        prev_level = level
        level = HOLT_ALPHA * y + (1 - HOLT_ALPHA) * (level + trend)
        trend = HOLT_BETA * (level - prev_level) + (1 - HOLT_BETA) * trend
    return round(level + trend, 2)


MODELS = [(M_NAIVE, naive, 1), (M_MA2, ma2, 2), (M_HOLT, holt, 3)]


# --------------------------------------------------------------------------- io

def load_sheet(wb, name: str) -> list[dict]:
    rows = list(wb[name].iter_rows(values_only=True))
    header = rows[0]
    return [dict(zip(header, r)) for r in rows[1:] if any(v is not None for v in r)]


def clean_row(r: dict) -> dict:
    r = dict(r)
    r["admission_year"] = int(r["admission_year"])
    r["score_scale"] = int(r["score_scale"]) if r["score_scale"] is not None else None
    r["subject_combination"] = (r["subject_combination"] or "").strip()
    for k in ("is_missing", "scale_confirmed"):
        v = r[k]
        r[k] = v if isinstance(v, bool) else str(v).strip().lower() in ("true", "1")
    r["cutoff_score"] = float(r["cutoff_score"]) if r["cutoff_score"] is not None else None
    return r


def trailing_consecutive(years: list[int], values: list[float], before: int) -> list[float]:
    """Các giá trị liên tiếp kết thúc ở năm before−1 (chuỗi bị đứt thì cắt)."""
    out: list[float] = []
    expect = before - 1
    for y, v in sorted(zip(years, values), reverse=True):
        if y >= before:
            continue
        if y != expect:
            break
        out.append(v)
        expect -= 1
    return out[::-1]


# --------------------------------------------------------------------------- main

def main() -> None:
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    cutoffs = [clean_row(r) for r in load_sheet(wb, "cutoff_score")]
    latest_year = max(r["admission_year"] for r in cutoffs)
    target_next = latest_year + 1

    # Khóa chuỗi = ngành + phương thức + thang. Tổ hợp chỉ tách thành chuỗi riêng khi
    # trường công bố NHẤT QUÁN nhiều điểm theo nhóm tổ hợp ở mọi năm (vd. BKA 2025–26
    # D01 vs A00;A01). Nếu danh sách tổ hợp đổi theo năm (vd. SPH 2023 C00/D01 →
    # 2024 ALL), gộp mỗi năm về 1 điểm = điểm cao nhất (bảo thủ khi tư vấn).
    combos_by_year: dict[tuple, dict[int, set]] = collections.defaultdict(lambda: collections.defaultdict(set))
    for r in cutoffs:
        if r["cutoff_score"] is not None:
            pms = (r["program_id"], r["admission_method"], r["score_scale"])
            combos_by_year[pms][r["admission_year"]].add(r["subject_combination"])
    split_by_combo = {
        pms for pms, by_year in combos_by_year.items()
        if len({frozenset(c) for c in by_year.values()}) == 1 and len(next(iter(by_year.values()))) > 1
    }

    # Gom chuỗi. Nhiều dòng cùng chuỗi-năm → lấy điểm cao nhất.
    series: dict[str, dict] = {}
    for r in cutoffs:
        pms = (r["program_id"], r["admission_method"], r["score_scale"])
        combo_part = r["subject_combination"] if pms in split_by_combo else "*"
        key = "|".join([r["program_id"], r["admission_method"], combo_part, str(r["score_scale"])])
        s = series.setdefault(key, {
            "program_id": r["program_id"], "university_code": r["university_code"],
            "admission_method": r["admission_method"], "subject_combination": combo_part,
            "score_scale": r["score_scale"], "family": method_family(r), "exam_type": exam_type(r),
            "points": {}, "excluded": collections.Counter(), "combos": {},
        })
        # Một chuỗi gộp có thể lẫn tổ hợp năng khiếu → cả chuỗi thuộc nhóm 5 (không dự báo).
        if method_family(r) == 5:
            s["family"] = 5
        if r["cutoff_score"] is None or r["is_missing"]:
            s["excluded"]["thiếu điểm"] += 1
            continue
        if not r["scale_confirmed"]:
            s["excluded"]["thang chưa xác nhận"] += 1
            continue
        if not is_admission_cutoff(r):
            s["excluded"]["ngưỡng nhận hồ sơ, không phải điểm trúng tuyển"] += 1
            continue
        prev = s["points"].get(r["admission_year"])
        if prev is None or r["cutoff_score"] > prev["v"]:
            s["points"][r["admission_year"]] = {"v": r["cutoff_score"], "confidence": r["confidence"]}
            s["combos"][r["admission_year"]] = r["subject_combination"]

    # Trạng thái chuỗi.
    for s in series.values():
        years = sorted(s["points"])
        s["years"] = years
        s["values"] = [s["points"][y]["v"] for y in years]
        if s["family"] in (4, 5):
            s["status"] = "NOT_FORECASTED"
            s["reason"] = ("Xét tuyển kết hợp: chưa lưu công thức/trọng số — không tự tính lại điểm chuẩn"
                           if s["family"] == 4 else
                           "Năng khiếu/tài năng/phỏng vấn: chỉ hiển thị lịch sử, chưa đủ cơ sở so sánh qua các năm")
        elif not years:
            s["status"] = "NOT_FORECASTED"
            s["reason"] = "Không có điểm hợp lệ: " + ", ".join(f"{k} ({v})" for k, v in s["excluded"].items())
        elif years[-1] < latest_year:
            s["status"] = "DISCONTINUED"
            s["reason"] = f"Phương thức không còn công bố điểm từ {years[-1] + 1}"
        elif len(trailing_consecutive(years, s["values"], target_next)) < 2:
            s["status"] = "INSUFFICIENT_HISTORY"
            s["reason"] = "Dưới 2 năm dữ liệu liên tiếp — chưa đủ cơ sở dự báo"
        elif s["family"] == 2:
            s["status"] = "CAUTION"
            s["reason"] = "Học bạ: chưa xác minh công thức tính điểm từng năm — không coi tương đương điểm thi THPT"
        elif all(s["points"][y]["confidence"] == "Thấp" for y in years):
            s["status"] = "CAUTION"
            s["reason"] = "Mọi năm có độ tin cậy nguồn 'Thấp'"
        else:
            s["status"] = "OK"
            s["reason"] = None

    # Chuỗi chính cho tư vấn theo điểm thi: nhóm 1, thang 30/40, có dự báo năm tới.
    # Ưu tiên: năm cuối mới nhất → nhiều năm hơn → tổ hợp 'ALL' → điểm năm cuối cao hơn (an toàn).
    by_program: dict[str, list[tuple[str, dict]]] = collections.defaultdict(list)
    for key, s in series.items():
        if s["family"] == 1 and s["score_scale"] in (30, 40) and s["status"] in ("OK", "CAUTION"):
            by_program[s["program_id"]].append((key, s))
    primary_keys = set()
    for items in by_program.values():
        items.sort(key=lambda ks: (ks[1]["years"][-1], len(ks[1]["years"]),
                                   ks[1]["subject_combination"] == "ALL", ks[1]["values"][-1]),
                   reverse=True)
        primary_keys.add(items[0][0])

    # Sinh dòng.
    rows: list[dict] = []
    for key in sorted(series):
        s = series[key]
        base = {
            "program_id": s["program_id"], "university_code": s["university_code"],
            "series_key": key, "admission_method": s["admission_method"], "exam_type": s["exam_type"],
            "method_family": s["family"], "subject_combination": s["subject_combination"],
            "score_scale": s["score_scale"], "forecast_status": s["status"], "status_reason": s["reason"],
            "is_primary": key in primary_keys,
        }
        if s["subject_combination"] == "*":
            # Chuỗi gộp: dòng dự báo mang tổ hợp của năm gần nhất, dòng thực tế mang tổ hợp của năm đó.
            base["subject_combination"] = s["combos"][s["years"][-1]] if s["years"] else None
        for y, v in zip(s["years"], s["values"]):
            rows.append({**base, "subject_combination": s["combos"][y],
                         "target_year": y, "method": M_ACTUAL, "forecast_cutoff": None,
                         "forecast_cutoff_30": None, "actual_cutoff": v, "error": None, "abs_error": None,
                         "n_history_years": None, "crosses_policy_change": None,
                         "regulation_version": REGULATION.get(y)})
        if s["status"] not in ("OK", "CAUTION", "DISCONTINUED"):
            continue
        targets = list(s["years"][1:])
        if s["status"] != "DISCONTINUED":
            targets.append(target_next)
        for t in targets:
            hist = trailing_consecutive(s["years"], s["values"], t)
            hist_years = list(range(t - len(hist), t))
            regs = {REGULATION.get(y) for y in hist_years} | {REGULATION.get(t)}
            actual = s["points"].get(t, {}).get("v")
            for name, fn, need in MODELS:
                if len(hist) < need:
                    continue
                f = fn(hist)
                err = round(actual - f, 2) if actual is not None else None  # quy ước cũ: thực tế − dự báo
                rows.append({**base, "target_year": t, "method": name, "forecast_cutoff": f,
                             "forecast_cutoff_30": to_30(f, s["score_scale"]), "actual_cutoff": actual,
                             "error": err, "abs_error": abs(err) if err is not None else None,
                             "n_history_years": len(hist), "crosses_policy_change": len(regs) > 1,
                             "regulation_version": REGULATION.get(t)})

    today = dt.date.today().isoformat()
    for i, r in enumerate(rows, 1):
        r["forecast_id"] = f"FS{i:05d}"
        r["forecast_date"] = None if r["method"] == M_ACTUAL else today

    OUT.mkdir(parents=True, exist_ok=True)
    write_sql(rows, OUT / "03_load_cutoff_forecast.sql")
    write_sql_parts(rows, OUT / "parts")
    write_summary(series, rows, primary_keys, OUT / "forecast_summary.txt")
    print((OUT / "forecast_summary.txt").read_text(encoding="utf-8"))


COLS = ["forecast_id", "program_id", "university_code", "target_year", "forecast_date", "method",
        "forecast_cutoff", "actual_cutoff", "error", "abs_error", "series_key", "admission_method",
        "exam_type", "method_family", "subject_combination", "score_scale", "forecast_cutoff_30",
        "n_history_years", "forecast_status", "status_reason", "crosses_policy_change",
        "regulation_version", "is_primary"]


def sql_lit(v) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return repr(v)
    return "'" + str(v).replace("'", "''") + "'"


def write_sql(rows: list[dict], path: Path) -> None:
    lines = [
        "-- SINH TỰ ĐỘNG bởi etl/build_method_forecast.py — không sửa tay.",
        "-- Chạy SAU dss-web-plan/fix/02_method_aware_cutoff.sql.",
        "-- Thay toàn bộ fact_cutoff_forecast (bảng dẫn xuất) bằng dự báo theo chuỗi phương thức.",
        "begin;",
        "delete from public.fact_cutoff_forecast;",
    ]
    for i in range(0, len(rows), 500):
        chunk = rows[i:i + 500]
        lines.append(f"insert into public.fact_cutoff_forecast ({', '.join(COLS)}) values")
        lines.append(",\n".join("(" + ", ".join(sql_lit(r[c]) for c in COLS) + ")" for r in chunk) + ";")
    lines += ["commit;", "",
              "-- Kiểm tra: select forecast_status, method, count(*) from fact_cutoff_forecast group by 1,2 order by 1,2;"]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_sql_parts(rows: list[dict], folder: Path, per_part: int = 600) -> int:
    """Tách thành nhiều file nhỏ cho Supabase SQL Editor (báo 'query too large' với file lớn).
    Part 1 xoá bảng cũ; mọi part dùng `on conflict do nothing` nên chạy lại part nào cũng an toàn."""
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob("03_part_*.sql"):
        old.unlink()
    chunks = [rows[i:i + per_part] for i in range(0, len(rows), per_part)]
    for n, chunk in enumerate(chunks, 1):
        lines = [f"-- SINH TỰ ĐỘNG — phần {n}/{len(chunks)}. Chạy lần lượt từ phần 1 (sau 02_method_aware_cutoff.sql)."]
        if n == 1:
            lines.append("delete from public.fact_cutoff_forecast;")
        lines.append(f"insert into public.fact_cutoff_forecast ({', '.join(COLS)}) values")
        lines.append(",\n".join("(" + ", ".join(sql_lit(r[c]) for c in COLS) + ")" for r in chunk))
        lines.append("on conflict do nothing;")
        if n == len(chunks):
            lines.append(f"-- Kiểm tra: select count(*) from fact_cutoff_forecast;  -- kỳ vọng {len(rows)}")
        (folder / f"03_part_{n:02d}.sql").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return len(chunks)


def write_summary(series: dict, rows: list[dict], primary_keys: set, path: Path) -> None:
    out = [f"Nguồn: {XLSX.name}", f"Tổng chuỗi: {len(series)} · Tổng dòng: {len(rows)} · "
           f"Ngành có chuỗi chính (tư vấn THPT): {len(primary_keys)}", ""]
    out.append("Chuỗi theo nhóm phương thức × trạng thái:")
    c = collections.Counter((s["family"], s["status"]) for s in series.values())
    for (fam, st), n in sorted(c.items()):
        out.append(f"  nhóm {fam}  {st:<22} {n}")
    out.append("")
    out.append("MAE backtest (dòng có thực tế), theo nhóm × mô hình:")
    acc = collections.defaultdict(list)
    for r in rows:
        if r["method"] != M_ACTUAL and r["abs_error"] is not None:
            acc[(r["method_family"], r["method"])].append(r["abs_error"])
            if r["is_primary"]:
                acc[("chính", r["method"])].append(r["abs_error"])
    for (fam, m), errs in sorted(acc.items(), key=lambda kv: (str(kv[0][0]), kv[0][1])):
        out.append(f"  nhóm {fam!s:<5} {m:<24} n={len(errs):<5} MAE={sum(errs) / len(errs):.3f}")
    out.append("")
    nxt = [r for r in rows if r["method"] == M_MA2 and r["actual_cutoff"] is None]
    out.append(f"Dòng dự báo MA2 cho năm tới: {len(nxt)} "
               f"(trong đó qua thay đổi quy chế: {sum(1 for r in nxt if r['crosses_policy_change'])})")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
