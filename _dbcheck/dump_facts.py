import openpyxl, io, os

path = "C:/Users/dat/Desktop/dss/DSS_Group5_DataPackage_v5.xlsx"
out = io.open("C:/Users/dat/Desktop/dss/_schema_facts.txt", "w", encoding="utf-8")
wb = openpyxl.load_workbook(path, read_only=True, data_only=True)

def rows_of(name):
    ws = wb[name]
    return [list(r) for r in ws.iter_rows(values_only=True)]

def nonempty(row):
    return any(c is not None and str(c).strip() != "" for c in row)

META_FULL = ["README", "Data_Dictionary", "Source_Log", "KPI_Sheet", "Case_Summary"]
DATA_TABLES = ["university", "program", "student", "score", "application",
               "application_method", "cutoff_score", "quota", "tuition",
               "employment", "labor_demand", "cutoff_forecast",
               "main_dataset", "student_outcome"]

out.write("############################################################\n")
out.write("# PART A — FULL METADATA SHEETS (authoritative)\n")
out.write("############################################################\n")
for name in META_FULL:
    rows = rows_of(name)
    out.write(f"\n==================== SHEET: {name} ====================\n")
    for r in rows:
        if not nonempty(r):
            continue
        vals = [str(c) if c is not None else "" for c in r]
        # trim trailing empties
        while vals and vals[-1] == "":
            vals.pop()
        out.write(" | ".join(vals) + "\n")

out.write("\n\n############################################################\n")
out.write("# PART B — DATA TABLES: header + 3 sample rows + distinct values\n")
out.write("############################################################\n")
for name in DATA_TABLES:
    rows = rows_of(name)
    data = [r for r in rows if nonempty(r)]
    if not data:
        continue
    header = [str(c) if c is not None else "" for c in data[0]]
    ncol = len(header)
    body = data[1:]
    out.write(f"\n==================== TABLE: {name}  (data_rows={len(body)}) ====================\n")
    out.write("HEADER: " + " | ".join(header) + "\n")
    out.write("SAMPLES:\n")
    for r in body[:3]:
        vals = [str(c) if c is not None else "" for c in r]
        out.write("  " + " | ".join(vals[:ncol]) + "\n")
    # distinct values per column (low cardinality) + null counts
    out.write("COLUMN PROFILE:\n")
    for ci in range(ncol):
        colname = header[ci] if ci < len(header) else f"col{ci}"
        vals = []
        nulls = 0
        for r in body:
            v = r[ci] if ci < len(r) else None
            if v is None or str(v).strip() == "":
                nulls += 1
            else:
                vals.append(v)
        distinct = list(dict.fromkeys([str(v) for v in vals]))
        # infer simple type
        def is_num(x):
            try:
                float(str(x)); return True
            except Exception:
                return False
        numlike = all(is_num(v) for v in vals[:200]) if vals else False
        info = f"  - {colname}: nulls={nulls}/{len(body)}, distinct={len(distinct)}"
        if numlike and vals:
            nums = [float(str(v)) for v in vals if is_num(v)]
            info += f", numeric min={min(nums):g} max={max(nums):g}"
        if len(distinct) <= 30:
            info += " | values=[" + "; ".join(distinct[:30]) + "]"
        else:
            info += " | sample=[" + "; ".join(distinct[:8]) + " ...]"
        out.write(info + "\n")

out.close()
print("done; size:", os.path.getsize("C:/Users/dat/Desktop/dss/_schema_facts.txt"))
