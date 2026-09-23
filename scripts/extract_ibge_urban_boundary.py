"""Extrai setores urbanos de um SHP do Censo 2022 para um GeoJSON leve.

Uso:
  python scripts/extract_ibge_urban_boundary.py BASE_SHP COD_MUN COD_DIST SAIDA

`BASE_SHP` deve ser informado sem a extensao .shp/.dbf. O script usa apenas a
biblioteca padrao para que a atualizacao da malha nao dependa de GDAL local.
"""

from __future__ import annotations

import json
import math
import struct
import sys
from collections import defaultdict
from pathlib import Path


def ler_dbf(caminho: Path):
    dados = caminho.read_bytes()
    total = struct.unpack_from("<I", dados, 4)[0]
    tamanho_cabecalho = struct.unpack_from("<H", dados, 8)[0]
    tamanho_registro = struct.unpack_from("<H", dados, 10)[0]
    campos = []
    posicao = 32
    deslocamento = 1
    while posicao < tamanho_cabecalho and dados[posicao] != 0x0D:
        descritor = dados[posicao : posicao + 32]
        nome = descritor[:11].split(b"\0", 1)[0].decode("ascii")
        tamanho = descritor[16]
        campos.append((nome, deslocamento, tamanho))
        deslocamento += tamanho
        posicao += 32

    registros = []
    for indice in range(total):
        inicio = tamanho_cabecalho + indice * tamanho_registro
        registro = dados[inicio : inicio + tamanho_registro]
        if not registro or registro[0:1] == b"*":
            registros.append(None)
            continue
        valores = {}
        for nome, inicio_campo, tamanho in campos:
            bruto = registro[inicio_campo : inicio_campo + tamanho]
            valores[nome] = bruto.decode("utf-8", errors="replace").strip()
        registros.append(valores)
    return campos, registros


def ler_poligonos_shp(caminho: Path):
    dados = caminho.read_bytes()
    posicao = 100
    registros = []
    while posicao + 8 <= len(dados):
        _, palavras = struct.unpack_from(">2i", dados, posicao)
        inicio = posicao + 8
        fim = inicio + palavras * 2
        tipo = struct.unpack_from("<i", dados, inicio)[0]
        if tipo == 0:
            registros.append([])
        elif tipo in (5, 15, 25):
            numero_partes, numero_pontos = struct.unpack_from("<2i", dados, inicio + 36)
            partes = list(struct.unpack_from(f"<{numero_partes}i", dados, inicio + 44))
            inicio_pontos = inicio + 44 + numero_partes * 4
            pontos = [
                list(struct.unpack_from("<2d", dados, inicio_pontos + i * 16))
                for i in range(numero_pontos)
            ]
            limites = partes[1:] + [numero_pontos]
            registros.append([pontos[a:b] for a, b in zip(partes, limites)])
        else:
            registros.append([])
        posicao = fim
    return registros


def distancia_ao_segmento(ponto, inicio, fim):
    dx = fim[0] - inicio[0]
    dy = fim[1] - inicio[1]
    if dx == 0 and dy == 0:
        return math.hypot(ponto[0] - inicio[0], ponto[1] - inicio[1])
    t = max(0.0, min(1.0, ((ponto[0] - inicio[0]) * dx + (ponto[1] - inicio[1]) * dy) / (dx * dx + dy * dy)))
    projecao = [inicio[0] + t * dx, inicio[1] + t * dy]
    return math.hypot(ponto[0] - projecao[0], ponto[1] - projecao[1])


def simplificar_linha(pontos, tolerancia=0.000012):
    if len(pontos) <= 3:
        return pontos
    fechado = pontos[0] == pontos[-1]
    base = pontos[:-1] if fechado else pontos
    if len(base) <= 3:
        return pontos

    # Em aneis, cortar no ponto mais distante do primeiro reduz o caso
    # degenerado em que inicio e fim do RDP sao iguais.
    extremo = max(range(1, len(base)), key=lambda i: math.hypot(base[i][0] - base[0][0], base[i][1] - base[0][1]))
    linha = base[: extremo + 1]
    volta = base[extremo:] + [base[0]]

    def rdp(segmento):
        if len(segmento) <= 2:
            return segmento
        indice = 0
        distancia = 0.0
        for i in range(1, len(segmento) - 1):
            atual = distancia_ao_segmento(segmento[i], segmento[0], segmento[-1])
            if atual > distancia:
                indice, distancia = i, atual
        if distancia <= tolerancia:
            return [segmento[0], segmento[-1]]
        esquerda = rdp(segmento[: indice + 1])
        direita = rdp(segmento[indice:])
        return esquerda[:-1] + direita

    simplificado = rdp(linha)[:-1] + rdp(volta)
    if fechado and simplificado[0] != simplificado[-1]:
        simplificado.append(simplificado[0])
    return simplificado


def construir_contornos_externos(aneis):
    """Remove arestas compartilhadas e monta somente o perimetro da uniao."""
    ocorrencias = defaultdict(int)
    for anel in aneis:
        for inicio, fim in zip(anel, anel[1:]):
            a = (round(inicio[0], 7), round(inicio[1], 7))
            b = (round(fim[0], 7), round(fim[1], 7))
            if a == b:
                continue
            ocorrencias[tuple(sorted((a, b)))] += 1

    externas = {aresta for aresta, total in ocorrencias.items() if total == 1}
    vizinhos = defaultdict(set)
    for a, b in externas:
        vizinhos[a].add(b)
        vizinhos[b].add(a)

    # Uma borda topologica valida tem exatamente duas vizinhancas por vertice.
    # Se a fonte contiver alguma quebra, mantemos os setores no GeoJSON, mas nao
    # publicamos um contorno externo possivelmente incorreto.
    graus_invalidos = {ponto: len(lista) for ponto, lista in vizinhos.items() if len(lista) != 2}
    if graus_invalidos:
        print(f"Aviso: {len(graus_invalidos)} vertices externos com grau diferente de 2")
        return []

    contornos = []
    restantes = set(externas)
    while restantes:
        primeira = next(iter(restantes))
        inicio, anterior = primeira[0], None
        atual = inicio
        contorno = [list(inicio)]
        while True:
            candidatos = [
                vizinho for vizinho in vizinhos[atual]
                if tuple(sorted((atual, vizinho))) in restantes and vizinho != anterior
            ]
            if not candidatos:
                break
            seguinte = candidatos[0]
            restantes.remove(tuple(sorted((atual, seguinte))))
            anterior, atual = atual, seguinte
            contorno.append(list(atual))
            if atual == inicio:
                break
        if len(contorno) >= 4 and contorno[0] == contorno[-1]:
            contornos.append(simplificar_linha(contorno))
    return contornos


def principal():
    if len(sys.argv) != 5:
        raise SystemExit(__doc__)
    base = Path(sys.argv[1])
    codigo_municipio, codigo_distrito = sys.argv[2], sys.argv[3]
    saida = Path(sys.argv[4])

    campos, atributos = ler_dbf(base.with_suffix(".dbf"))
    poligonos = ler_poligonos_shp(base.with_suffix(".shp"))
    nomes = {campo[0] for campo in campos}
    print("Campos:", ", ".join(sorted(nomes)))

    selecionados = []
    originais = []
    situacoes = {}
    for atributo, partes in zip(atributos, poligonos):
        if not atributo or atributo.get("CD_MUN") != codigo_municipio:
            continue
        situacao = atributo.get("SITUACAO") or atributo.get("NM_SIT") or atributo.get("CD_SIT") or ""
        situacoes[situacao] = situacoes.get(situacao, 0) + 1
        if atributo.get("CD_DIST") != codigo_distrito:
            continue
        codigo_situacao = atributo.get("CD_SIT", "")
        urbana = situacao.casefold().startswith("urbana") or codigo_situacao in {"1", "2", "3"}
        if not urbana:
            continue
        for anel in partes:
            originais.append(anel)
            simplificado = simplificar_linha(anel)
            if len(simplificado) >= 4:
                selecionados.append([[round(x, 7), round(y, 7)] for x, y in simplificado])

    if not selecionados:
        raise SystemExit(f"Nenhum setor urbano encontrado. Situacoes no municipio: {situacoes}")

    contornos_externos = construir_contornos_externos(originais)
    conteudo = {
        "type": "Feature",
        "properties": {
            "source": "IBGE - Malha de Setores Censitarios 2022",
            "municipalityCode": codigo_municipio,
            "districtCode": codigo_distrito,
            "crs": "EPSG:4674",
            "outline": [
                [[round(x, 7), round(y, 7)] for x, y in anel]
                for anel in contornos_externos
            ],
        },
        "geometry": {"type": "MultiPolygon", "coordinates": [[anel] for anel in selecionados]},
    }
    saida.parent.mkdir(parents=True, exist_ok=True)
    saida.write_text(json.dumps(conteudo, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Situacoes no municipio: {situacoes}")
    print(f"Gravados {len(selecionados)} aneis em {saida} ({saida.stat().st_size} bytes)")
    print(f"Contornos externos: {len(contornos_externos)}")


if __name__ == "__main__":
    principal()
