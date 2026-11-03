"""Validate documentation assets, not application behavior. Standard library only."""
import argparse
import csv
import json
from pathlib import Path
import re
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_json(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def xlsx_rows(filename, sheet_number=1):
    with zipfile.ZipFile(filename) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            strings = ["".join(el.itertext()) for el in shared]
        sheet = ET.fromstring(archive.read(f"xl/worksheets/sheet{sheet_number}.xml"))
        rows = []
        for row in sheet.findall("s:sheetData/s:row", NS):
            cells = {}
            for cell in row.findall("s:c", NS):
                address = cell.attrib["r"]
                column = re.match(r"[A-Z]+", address).group()
                raw = cell.find("s:v", NS)
                value = raw.text if raw is not None else ""
                if cell.attrib.get("t") == "s":
                    value = strings[int(value)]
                elif cell.attrib.get("t") == "inlineStr":
                    value = "".join(cell.find("s:is", NS).itertext())
                cells[column] = value or ""
                assert cell.attrib.get("t") != "e", (filename, address, value)
            rows.append((int(row.attrib["r"]), cells))
        return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-executed", action="store_true")
    args = parser.parse_args()
    catalogue = read_json("test-cases/system-test-cases.json")
    cases = catalogue["cases"]
    assert len(cases) == 170
    assert len({c["id"] for c in cases}) == len(cases)
    definitions = {d["id"]: d for d in catalogue["testData"]}
    for case in cases:
        assert case["steps"] and case["expected"] and case["preconditions"], case["id"]
        assert case["priority"] in {"P1", "P2", "P3"}
        assert set(case["data"]) <= definitions.keys(), case["id"]
        assert case["status"] == "Not Run", case["id"]
        assert all(not case[k] for k in ("actualResult", "evidence", "tester", "runDate", "defectReference"))
    for key, field in (("useCases", "uc"), ("businessRules", "br"), ("commonRequirements", "cr")):
        known = {x["id"] for x in catalogue["sources"][key]}
        used = {x for case in cases for x in case[field]}
        assert used == known, (key, used ^ known)
    for definition in definitions.values():
        if definition["asset"]:
            assert (ROOT / "test-cases" / definition["asset"]).is_file(), definition["id"]
    assert all(d["status"] in {"Awaiting clarification", "Deferred by team", "Partially confirmed"} for d in catalogue["deferredDecisions"])

    manifest = read_json("test-data/fixture-manifest.json")
    tables = manifest["fixtureTables"]
    for stem, header, expected in (
        ("valid-transactions", tables["header"], tables["valid"]),
        ("mixed-transactions", tables["header"], tables["mixed"]),
        ("missing-required-column", tables["missingColumn"]["header"], tables["missingColumn"]["rows"]),
    ):
        with (ROOT / "test-data" / f"{stem}.csv").open(newline="", encoding="utf-8") as stream:
            actual = list(csv.reader(stream))
        expected_text = [[str(v) for v in row] for row in [header, *expected]]
        assert actual == expected_text, stem
        raw_rows = xlsx_rows(ROOT / "test-data" / f"{stem}.xlsx")
        xrows = [[cells.get(chr(65+i), "") for i in range(len(header))] for _, cells in raw_rows]
        assert xrows == expected_text, (stem, "CSV/XLSX mismatch")

    examples = read_json("test-data/transaction-examples.json")
    base = examples["TX-BASE"]
    assert examples["TX-CONFLICT"]["transaction_ref"] == base["transaction_ref"]
    assert examples["TX-CONFLICT"]["amount"] != base["amount"]
    assert len(tables["valid"]) == 3 and len(tables["mixed"]) == 7
    mixed = tables["mixed"]
    assert mixed[2] == tables["duplicate"][0]
    assert mixed[3][0] == mixed[2][0] and mixed[3][1] != mixed[2][1]
    assert mixed[4][1] == "not-a-number" and not mixed[5][2] and not mixed[6][0]
    assert "paid_at" not in tables["missingColumn"]["header"]
    assert sum(manifest["files"]["mixed"][k] for k in ("accepted", "duplicate", "conflict", "invalid")) == 7

    workbook = ROOT / "test-cases/SEP490_FA26SE215_Report5_System_Test_Cases.xlsx"
    case_rows = dict(xlsx_rows(workbook, 2))
    for row, case in enumerate(cases, 9):
        cells = case_rows[row]
        assert cells["A"] == case["id"] and cells["C"] == case["title"]
        assert cells["D"] == ", ".join(case["uc"]) and cells["E"] == ", ".join(case["br"])
        assert cells["F"] == ", ".join(case["cr"]) and cells["G"] == case["quality"]
        assert cells["I"] == case["preconditions"] and cells["J"] == ", ".join(case["data"])
        assert cells["K"] == "\n".join(f"{i+1}. {s}" for i, s in enumerate(case["steps"]))
        assert cells["L"] == "\n".join(f"{i+1}. {s}" for i, s in enumerate(case["expected"]))
        if not args.allow_executed:
            assert cells["M"] == "Not Run" and all(not cells.get(c) for c in "NOPQR")
    for number in range(1, 6):
        xlsx_rows(workbook, number)
    overview = dict(xlsx_rows(workbook, 1))
    if not args.allow_executed:
        assert overview[8]["B"] == "170" and overview[9]["B"] == "0"
        assert overview[15]["B"] == "0" and overview[16]["B"] == "Not run"
    coverage = dict(xlsx_rows(workbook, 3))
    for row in range(7, 108):
        requirement = coverage[row]["B"]
        ids = [c["id"] for c in cases if requirement in c["uc"] + c["br"] + c["cr"]]
        assert coverage[row]["D"] == str(len(ids)) and coverage[row]["E"] == ", ".join(ids)
    print(f"PASS: {len(cases)} designed cases; 101 requirement IDs; {len(definitions)} profiles; CSV/XLSX equivalence; no fabricated execution results in authored baseline.")
    print("This validates documentation assets only. No application scenario was executed.")


if __name__ == "__main__":
    main()
