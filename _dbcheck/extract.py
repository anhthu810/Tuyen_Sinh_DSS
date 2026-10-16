import openpyxl, io, json, os, datetime

XL = "C:/Users/dat/Desktop/dss/DSS_Group5_DataPackage_v5.xlsx"
OUT = "C:/Users/dat/Desktop/dss/_dbcheck/data"
os.makedirs(OUT, exist_ok=True)
wb = openpyxl.load_workbook(XL, read_only=True, data_only=True)

def clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        s = v.strip()
        return s if s != "" else None
    return v

def to_int(v):
    v = clean(v)
    if v is None: return None
    try: return int(round(float(v)))
    except Exception: return None

def to_num(v):
    v = clean(v)
    if v is None: return None
    try: return float(v)
    except Exception: return None

def to_bool(v):
    v = clean(v)
    if v is None: return None
    if isinstance(v, bool): return v
    s = str(v).strip().lower()
    if s in ("true","1","yes","x"): return True
    if s in ("false","0","no"): return False
    return None

def to_date(v):
    v = clean(v)
    if v is None: return None
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.isoformat()[:10]
    s = str(v).strip()
    return s[:10] if s else None

def to_text(v):
    v = clean(v)
    return None if v is None else str(v)

CASTS = {"int": to_int, "num": to_num, "bool": to_bool, "date": to_date, "text": to_text}

# sheet_name -> {db_column: (source_header, cast)}  (only columns that exist in DB)
SPECS = {
    "cutoff_score": {
        "cutoff_id":"text","program_id":"text","university_code":"text","admission_year":"int",
        "announce_date":"date","announce_date_is_approx":"bool","admission_method":"text",
        "method_group":"text","subject_combination":"text","cutoff_score":"num","score_scale":"num",
        "scale_confirmed":"bool","cutoff_score_30":"num","is_missing":"bool","n_sources_agree":"int",
        "confidence":"text","source_type":"text","source_url":"text","note":"text",
        "published_code":"text","data_version":"text",
    },
    "score": {  # -> fact_exam_score (DB has 20 cols; skip the 4 subject-list cols absent in DB)
        "score_id":"text","student_id":"text","exam_year":"int","exam_date":"date",
        "score_math":"num","score_physics":"num","score_chemistry":"num","score_biology":"num",
        "score_literature":"num","score_history":"num","score_geography":"num","score_english":"num",
        "hb_math":"num","hb_physics":"num","hb_chemistry":"num","hb_biology":"num",
        "hb_literature":"num","hb_history":"num","hb_geography":"num","hb_english":"num",
    },
    "cutoff_forecast": {  # -> fact_cutoff_forecast (NEW TABLE)
        "forecast_id":"text","program_id":"text","university_code":"text","target_year":"int",
        "forecast_date":"date","method":"text","forecast_cutoff":"num","actual_cutoff":"num",
        "error":"num","abs_error":"num",
    },
    "application_method": {  # -> fact_application_method (NEW TABLE)
        "app_method_id":"text","application_id":"text","cutoff_id":"text","admission_method":"text",
        "combination_used":"text","raw_score":"num","priority_bonus":"num","final_score":"num",
        "score_scale":"num","cutoff_score":"num","score_margin":"num","score_margin_30":"num",
        "is_eligible":"bool","converted_from":"text",
    },
}

summary = {}
for sheet, spec in SPECS.items():
    ws = wb[sheet]
    rows = ws.iter_rows(values_only=True)
    header = [str(c).strip() if c is not None else "" for c in next(rows)]
    hidx = {h: i for i, h in enumerate(header)}
    records = []
    for r in rows:
        if not any(c is not None and str(c).strip() != "" for c in r):
            continue
        rec = {}
        for col, kind in spec.items():
            i = hidx.get(col)
            raw = r[i] if (i is not None and i < len(r)) else None
            rec[col] = CASTS[kind](raw)
        # require a non-null primary-ish key (first column)
        pk = list(spec.keys())[0]
        if rec.get(pk) is None:
            continue
        records.append(rec)
    path = os.path.join(OUT, sheet + ".json")
    io.open(path, "w", encoding="utf-8").write(json.dumps(records, ensure_ascii=False))
    summary[sheet] = len(records)

print(json.dumps(summary))
