"""Extrai a planta vetorial oficial de Floresta para o gerador de PDF.

Uso:
  python scripts/extract_floresta_official_map.py origem.pdf

O PDF da prefeitura foi plotado pelo AutoCAD com rotação de 270 graus. O
arquivo gerado contém apenas os polígonos coloridos, os traços cartográficos e
os rios; nenhum bitmap é incorporado ao bundle.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src" / "data" / "maps" / "florestaPeOfficialMap.js"
IGNORED_STROKE_LAYERS = {
    "Texto_Ruas",
    "PDF_Textos",
    "PDF_Text",
    "DWGAUTOCAD.COM",
    "PDF_Cotas",
}


def rounded_point(point, raw_width):
    # Coordenadas brutas estão em retrato. A página é exibida girada 270°.
    return [round(point.y, 1), round(raw_width - point.x, 1)]


def split_paths(items, raw_width):
    paths = []
    current = []
    for item in items:
        kind = item[0]
        if kind == "l":
            start = rounded_point(item[1], raw_width)
            end = rounded_point(item[2], raw_width)
            if not current or current[-1] != start:
                if len(current) >= 2:
                    paths.append(current)
                current = [start]
            current.append(end)
        elif kind == "c":
            # Há somente uma curva decorativa no arquivo. Os controles viram
            # segmentos curtos, preservando visualmente o objeto no A3.
            points = [rounded_point(point, raw_width) for point in item[1:]]
            if current and current[-1] != points[0]:
                if len(current) >= 2:
                    paths.append(current)
                current = []
            if not current:
                current.append(points[0])
            current.extend(points[1:])
    if len(current) >= 2:
        paths.append(current)
    return paths


def rgb(color):
    return [round(channel * 255) for channel in color]


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Informe o PDF vetorial da prefeitura.")
    source = Path(sys.argv[1]).resolve()
    document = pymupdf.open(source)
    page = document[0]
    raw_width = page.mediabox.width

    fills = []
    strokes = []
    for drawing in page.get_drawings():
        paths = split_paths(drawing["items"], raw_width)
        if drawing.get("fill"):
            for path in paths:
                if len(path) >= 3:
                    fills.append([rgb(drawing["fill"]), path])
        # Polígonos preenchidos já chegam com a mesma cor no contorno. Repetir
        # esse traço duplicaria milhares de caminhos sem alterar a planta.
        if (not drawing.get("fill") and drawing.get("color")
                and drawing.get("layer") not in IGNORED_STROKE_LAYERS):
            for path in paths:
                strokes.append([
                    rgb(drawing["color"]),
                    round(float(drawing.get("width") or 0.35), 2),
                    drawing.get("layer") == "RIO-RIACHO",
                    path,
                ])

    labels = [
        ["AABB", 630.5, 855.9],
        ["MORADA NOBRE", 1029.5, 758.1],
        ["TRÊS MARIAS", 894.5, 1099.9],
        ["COHAB", 1432.5, 1139.6],
        ["PARQUE DAS ACÁCIAS", 1145.8, 1472.6],
        ["BELA VISTA", 788.3, 1798.3],
        ["SÃO FRANCISCO DE ASSIS (DNER)", 1326.5, 1803.5],
        ["CAETANO II", 1457.4, 1404.5],
        ["CAETANO I", 1792.3, 1716.1],
        ["PEDRAS DE JOSINA", 1925.6, 1922.0],
        ["CARAIBEIRAS", 1779.6, 1263.6],
        ["SANTA ROSA", 1952.1, 995.2],
        ["CENTRO", 2318.8, 1394.5],
        ["BELA FLORESTA", 2571.6, 837.5],
        ["MATADOURO", 2168.8, 425.8],
        ["ALTO DA ERMIDA", 2764.9, 2003.0],
    ]
    street_labels = []
    street_prefix = re.compile(
        r"^(Rua|Avenida|Av\.?|Travessa|Tv\.?|Rodovia|Estrada|Praça|Alameda|Beco)\s+",
        re.IGNORECASE,
    )
    for block in page.get_text("dict").get("blocks", []):
        for line in block.get("lines", []):
            text = "".join(span.get("text", "") for span in line.get("spans", [])).strip()
            if not street_prefix.match(text):
                continue
            x0, y0, x1, y1 = line["bbox"]
            center = rounded_point(pymupdf.Point((x0 + x1) / 2, (y0 + y1) / 2), raw_width)
            street_labels.append([text, *center])
    payload = {
        "source": "Prefeitura Municipal de Floresta - planta urbana vetorial",
        "width": round(page.rect.width, 1),
        "height": round(page.rect.height, 1),
        "fills": fills,
        "strokes": strokes,
        "labels": labels,
        "streetLabels": street_labels,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        "// Gerado por scripts/extract_floresta_official_map.py.\n"
        "// Fonte: planta vetorial fornecida pela Prefeitura Municipal de Floresta.\n"
        f"export default {json.dumps(payload, ensure_ascii=False, separators=(',', ':'))};\n",
        encoding="utf-8",
    )
    print(json.dumps({"output": str(OUTPUT), "fills": len(fills), "strokes": len(strokes)}))


if __name__ == "__main__":
    main()
