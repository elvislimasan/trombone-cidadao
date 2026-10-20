"""Extract the 20-column Ilumina PE table. Requires PyMuPDF (pymupdf)."""
import argparse
import json
import pathlib
import re
import pymupdf


def extract(source):
    result = []
    with pymupdf.open(source) as document:
        for page_number, page in enumerate(document, 1):
            words = page.get_text('words')
            for table in page.find_tables().tables:
                for cells in table.extract():
                    if not cells[0] or not cells[0].strip().isdigit():
                        continue
                    if len(cells) != 20:
                        raise ValueError(f'Expected 20 columns on page {page_number}')
                    # Some PDF borders merge adjacent latitude rows or latitude/longitude
                    # cells. Recover each coordinate from its visual row, not text order.
                    anchors = [w for w in words if w[4] == cells[0].strip() and w[0] < table.bbox[0] + 35]
                    if len(anchors) != 1:
                        raise ValueError(f'Ambiguous row {cells[0]} on page {page_number}')
                    anchor = anchors[0]
                    for column, pattern in [(7, r'-8\.\d+'), (8, r'-38\.\d+')]:
                        candidates = [w for w in words if re.fullmatch(pattern, w[4]) and abs(w[1] - anchor[1]) < 10]
                        if len(candidates) != 1:
                            raise ValueError(f'Ambiguous coordinate at row {cells[0]} on page {page_number}')
                        cells[column] = candidates[0][4]
                    result.append({'page': page_number, 'cells': cells})
    numbers = [int(row['cells'][0]) for row in result]
    if not numbers or numbers != list(range(1, len(numbers) + 1)):
        raise ValueError('Table has missing, duplicate or unordered row numbers')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('pdf', type=pathlib.Path)
    parser.add_argument('output', type=pathlib.Path)
    args = parser.parse_args()
    rows = extract(args.pdf)
    args.output.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({'rows': len(rows), 'output': str(args.output)}))
