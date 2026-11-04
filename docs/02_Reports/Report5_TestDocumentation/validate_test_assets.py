"""Validate documentation assets, not application behavior. Standard library only."""
import argparse
import csv
import json
from pathlib import Path
import posixpath
import re
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent
NS = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}


def read_json(name):
    return json.loads((ROOT / name).read_text(encoding="utf-8"))


def xlsx_rows(filename, sheet_number=1):
    with zipfile.ZipFile(filename) as archive:
        sheet_path = f"xl/worksheets/sheet{sheet_number}.xml"
        if isinstance(sheet_number, str):
            sheets = ET.fromstring(archive.read("xl/workbook.xml")).find("s:sheets", NS)
            target = next(sheet for sheet in sheets if sheet.attrib["name"] == sheet_number)
            relationship_id = target.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
            relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
            target_path = next(rel.attrib["Target"] for rel in relationships if rel.attrib["Id"] == relationship_id)
            sheet_path = target_path.lstrip("/") if target_path.startswith("/") else posixpath.normpath("xl/" + target_path)
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            shared = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            strings = ["".join(el.itertext()) for el in shared]
        sheet = ET.fromstring(archive.read(sheet_path))
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
    assert len(cases) == 191
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
    assert all(d["status"] in {
        "Awaiting clarification", "Deferred by team", "Partially confirmed",
        "Core confirmed; extensions pending", "Reconciliation confirmed; scheduling pending",
        "Core confirmed; rollout details pending", "Core time rules confirmed; provider races pending",
    } for d in catalogue["deferredDecisions"])

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
    functions = dict(xlsx_rows(workbook, "Functions"))
    groups = list(dict.fromkeys(c["group"] for c in cases))
    statuses = {"Not Run", "Pass", "Fail", "Blocked", "Not Applicable"}
    for index, group in enumerate(groups, 6):
        group_cases = [c for c in cases if c["group"] == group]
        sheet_name = functions[index]["B"]
        assert float(functions[index]["E"]) == len(group_cases), group
        case_rows = dict(xlsx_rows(workbook, sheet_name))
        assert {cells.get("A") for _, cells in case_rows.items() if cells.get("A", "").startswith("SYS-")} == {c["id"] for c in group_cases}
        for row, case in enumerate(group_cases, 6):
            cells = case_rows[row]
            assert cells["A"] == case["id"] and cells["B"] == case["title"], case["id"]
            assert cells["C"] == "\n".join(f"{i+1}. {s}" for i, s in enumerate(case["steps"]))
            assert cells["D"] == "\n".join(f"{i+1}. {s}" for i, s in enumerate(case["expected"]))
            assert cells["E"] == case["preconditions"] and cells["F"] == "\n".join(case["data"])
            assert cells["G"] == "\n".join([f"SRS {case['ref']}", *case["uc"], *case["br"], *case["cr"]])
            assert cells["H"] == case["priority"] and cells["I"] in statuses
            if not args.allow_executed:
                assert cells["I"] == "Not Run" and all(not cells.get(c) for c in "JKLMNO")

    unit_catalogue = read_json("test-cases/unit-test-cases.json")
    unit_functions = unit_catalogue["functions"]
    unit_cases = [case for function in unit_functions for case in function["scenarios"]]
    assert len(unit_functions) == 33 and len(unit_cases) == 164
    assert len({case["id"] for case in unit_cases}) == len(unit_cases)
    unit_workbook = ROOT / "test-cases/SEP490_FA26SE215_Report5_Unit_Test_Cases.xlsx"
    function_rows = dict(xlsx_rows(unit_workbook, "Functions"))
    for index, function in enumerate(unit_functions, 6):
        rows = dict(xlsx_rows(unit_workbook, function["tab"]))
        assert function_rows[index]["B"] == function["cls"]
        assert function_rows[index]["C"] == function["method"]
        assert function_rows[index]["D"] == function["ref"]
        assert float(function_rows[index]["F"]) == len(function["scenarios"])
        assert rows[5]["C"].startswith("Planned"), function["tab"]
        for offset, case in enumerate(function["scenarios"]):
            column = chr(67 + offset)
            assert case["input"] and case["expected"] and case["type"] in {"N", "A", "B"}
            assert case["status"] == "Not Run"
            assert rows[8][column] == case["id"]
            selected = [cells["B"] for _, cells in rows.items() if cells.get(column) == "O"]
            assert selected == [case["input"], case["expected"]], case["id"]
            status_row = function["statusRow"]
            assert rows[status_row - 1][column] == case["type"]
            assert rows[status_row][column] in statuses
            if not args.allow_executed:
                assert rows[status_row][column] == "Not Run"
                assert all(not rows[row].get(column) for row in range(status_row + 1, function["lastRow"] + 1))

    for filename, expected in ((workbook, len(cases)), (unit_workbook, len(unit_cases))):
        with zipfile.ZipFile(filename) as archive:
            sheets = ET.fromstring(archive.read("xl/workbook.xml")).find("s:sheets", NS)
            for sheet in sheets:
                xlsx_rows(filename, sheet.attrib["name"])
        totals = next(cells for _, cells in xlsx_rows(filename, "Statistics") if cells.get("A") == "Total")
        assert totals["B"] == str(expected)
        if not args.allow_executed:
            assert totals["C"] == str(expected) and all(totals[c] == "0" for c in "DEFG")
    print(f"PASS: {len(cases)} system cases; {len(unit_cases)} planned unit cases; 101 requirement IDs; {len(definitions)} profiles; CSV/XLSX equivalence; no fabricated execution results in authored baseline.")
    print("This validates documentation assets only. No application scenario was executed.")


if __name__ == "__main__":
    main()
