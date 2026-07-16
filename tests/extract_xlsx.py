import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree as ET

MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
NS = {"m": MAIN, "r": REL, "p": PKG}


def col_index(cell_ref: str) -> int:
    letters = re.match(r"[A-Z]+", cell_ref).group(0)
    value = 0
    for char in letters:
        value = value * 26 + ord(char) - 64
    return value - 1


def read_rows(path: str, sheet_name: str):
    with ZipFile(path) as archive:
        shared = []
        try:
            root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in root.findall("m:si", NS):
                shared.append("".join(node.text or "" for node in item.iter(f"{{{MAIN}}}t")))
        except KeyError:
            pass

        workbook = ET.fromstring(archive.read("xl/workbook.xml"))
        relationships = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        rel_map = {node.attrib["Id"]: node.attrib["Target"] for node in relationships}
        target = None
        for sheet in workbook.find("m:sheets", NS):
            if sheet.attrib["name"] == sheet_name:
                target = rel_map[sheet.attrib[f"{{{REL}}}id"]]
                break
        if target is None:
            raise KeyError(f"Foglio non trovato: {sheet_name}")
        target = target.lstrip("/")
        if not target.startswith("xl/"):
            target = "xl/" + target

        root = ET.fromstring(archive.read(target))
        matrix = []
        for row in root.findall(".//m:sheetData/m:row", NS):
            values = {}
            for cell in row.findall("m:c", NS):
                index = col_index(cell.attrib["r"])
                cell_type = cell.attrib.get("t")
                value_node = cell.find("m:v", NS)
                value = ""
                if cell_type == "inlineStr":
                    inline = cell.find("m:is", NS)
                    if inline is not None:
                        value = "".join(node.text or "" for node in inline.iter(f"{{{MAIN}}}t"))
                elif value_node is not None:
                    raw = value_node.text or ""
                    if cell_type == "s" and raw:
                        value = shared[int(raw)]
                    elif cell_type == "b":
                        value = raw == "1"
                    else:
                        try:
                            number = float(raw)
                            value = int(number) if number.is_integer() else number
                        except ValueError:
                            value = raw
                values[index] = value
            if values:
                out = [""] * (max(values) + 1)
                for index, value in values.items():
                    out[index] = value
                matrix.append(out)

    headers = [str(value) for value in matrix[0]]
    rows = []
    for line in matrix[1:]:
        if len(line) < len(headers):
            line += [""] * (len(headers) - len(line))
        rows.append({headers[index]: line[index] for index in range(len(headers))})
    return rows


if __name__ == "__main__":
    path, sheet_name, output = sys.argv[1:4]
    Path(output).write_text(json.dumps(read_rows(path, sheet_name), ensure_ascii=False), encoding="utf-8")
