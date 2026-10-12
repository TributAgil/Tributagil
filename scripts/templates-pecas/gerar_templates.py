"""Gera templates/pecas/*.docx (com marcadores do docx-templates) a partir dos
modelos ORIGINAIS da advogada em templates/pecas/originais/ (nunca alterados).

Rodar a partir da raiz do repositório:
    python scripts/templates-pecas/gerar_templates.py

Por que um script e não edição manual no Word: os modelos têm dados reais do
caso original misturados ao texto jurídico (datas, CDA, PAF, nomes, prints com
nome de parte). O script troca SÓ o que é dado do caso por marcadores, não toca
no texto jurídico, e é reexecutável quando a advogada mandar um modelo novo.

Marcadores usados (docx-templates, delimitador padrão +++ +++):
    +++INS expr+++            insere valor
    +++IF expr+++ / +++ELSE+++ / +++END-IF+++
    +++FOR x IN lista+++ / +++END-FOR x+++   (variável do laço usada como $x)
O contexto de dados vem de api/_contexto-peca.js.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(__file__))
from docx_xml import *  # noqa: F401,F403

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
ORIGINAIS = os.path.join(RAIZ, 'templates', 'pecas', 'originais')
SAIDA = os.path.join(RAIZ, 'templates', 'pecas')


def cmd(s):
    return f'+++{s}+++'


def ins(expr):
    return cmd(f'INS {expr}')


def para_cmd(s):
    return paragrafo_comando(cmd(s))


def exigir(ok, onde):
    """Falha ALTO se uma substituição não encontrou o trecho esperado — um
    template silenciosamente sem marcador geraria peça com dado do caso antigo."""
    if not ok:
        raise SystemExit(f'ERRO: trecho esperado não encontrado ({onde}). O modelo original mudou?')


def trocar(p, antigo, novo, onde, ocorrencia=1):
    exigir(trocar_no_paragrafo(p, antigo, novo, ocorrencia), f'{onde}: "{antigo}"')


def cercar(ref_ini, ref_fim, abre, fecha):
    """Coloca parágrafos de comando antes de ref_ini e depois de ref_fim (irmãos no mesmo nível).

    `abre` e `fecha` na ordem em que são LIDOS no documento: o comando mais
    externo primeiro em `abre`, o mais interno primeiro em `fecha`.
    """
    for a in abre:  # cada addprevious cola logo acima de ref_ini, então o 1º fica mais acima
        ref_ini.addprevious(para_cmd(a))
    ult = ref_fim
    for f in fecha:
        novo = para_cmd(f)
        ult.addnext(novo)
        ult = novo


def rpr_corpo(p):
    """Fonte e tamanho do 1º run com texto de um parágrafo do corpo (para as tabelas novas)."""
    for r in runs_com_texto(p):
        rf = r.find('w:rPr/w:rFonts', NS)
        sz = r.find('w:rPr/w:sz', NS)
        fonte = rf.get(q('ascii')) if rf is not None else 'Times New Roman'
        tam = int(sz.get(q('val'))) if sz is not None else 24
        return fonte, tam
    return 'Times New Roman', 24


def aplicar_tratamento(p):
    """C.4: "sua advogada que esta subscreve, constituída" -> concordância pelo cadastro do escritório
    (sua advogada / seu advogado / suas advogadas / seus advogados; subscreve/subscrevem; constituída/o/as/os)."""
    trocar(p, 'sua advogada', ins('tratamento_procurador'), 'tratamento do procurador')
    trocar(p, 'subscreve', ins('subscreve_concord'), 'verbo subscrever')
    trocar(p, 'constituída', ins('constituido_concord'), 'particípio constituída')


def qualificacao_nome_e_resto(p, nome_modelo, nome_var, resto_var):
    """O NOME fica no run em negrito do modelo; o RESTO da qualificação (nacionalidade… endereço) no run normal."""
    trocar(p, nome_modelo, ins(nome_var), 'nome na qualificação')
    exigir(trocar_entre(p, 'nacionalidade', 'endereço completo', ins(resto_var)), 'resto da qualificação')


def assinatura(c, i_lista_ini, i_lista_fim, i_docassinado, i_generico):
    """Bloco de assinatura: laço sobre a lista de advogados + "Documento assinado digitalmente".

    c[i_generico]   : linha genérica "ADVOGADO(A) | OAB/UF" — removida
    c[i_lista_ini]  : 1º nome fixo — vira o item do laço
    c[i_lista_ini+1 .. i_lista_fim] : demais nomes fixos (e vazios) — removidos
    c[i_docassinado]: "Documento assinado digitalmente" — vai para depois do laço
    """
    doc_assinado = c[i_docassinado]
    remover(c[i_generico])
    item = c[i_lista_ini]
    definir_texto_paragrafo(item, f'{ins("$a.nome")} | {ins("$a.oab")}')
    tirar_cor(item)  # nos modelos os nomes estão em branco (invisíveis); aqui precisam aparecer
    for k in range(i_lista_ini + 1, i_lista_fim + 1):
        if c[k].getparent() is not None:
            remover(c[k])
    doc_assinado.getparent().remove(doc_assinado)
    item.addprevious(para_cmd('FOR a IN advogados'))
    fim = para_cmd('END-FOR a')
    item.addnext(fim)
    fim.addnext(doc_assinado)


def logo_cabecalho(partes):
    """Cabeçalhos: tira o logo "Programa Advogado Aprendiz" e põe o logo do escritório (opcional)."""
    for nome in [n for n in partes if re.fullmatch(r'word/header\d+\.xml', n)]:
        raiz = parse(partes[nome])
        primeiro = raiz.find('w:p', NS)
        ppr = primeiro.find('w:pPr', NS) if primeiro is not None else None
        for filho in list(raiz):
            raiz.remove(filho)
        raiz.append(para_cmd('IF tem_logo'))
        p_logo = etree.SubElement(raiz, q('p'))
        if ppr is not None:
            p_logo.append(ppr)
        r = etree.SubElement(p_logo, q('r'))
        t = etree.SubElement(r, q('t'))
        t.text = cmd('IMAGE logo()')
        raiz.append(para_cmd('END-IF'))
        raiz.append(etree.Element(q('p')))  # parágrafo final obrigatório
        partes[nome] = serializar(raiz)


def rodape(partes):
    """Rodapés: dados genéricos do modelo viram campos do cadastro do escritório."""
    for nome in [n for n in partes if re.fullmatch(r'word/footer\d+\.xml', n)]:
        raiz = parse(partes[nome])
        for p in raiz.iter(q('p')):
            trocar_no_paragrafo(p, 'advogado@escritório.adv.br', ins('escritorio_email'))
            trocar_no_paragrafo(p, 'www.escritorio.adv.br', ins('escritorio_site'))
            trocar_no_paragrafo(p, 'Endereço do escritório', ins('escritorio_endereco'))
        partes[nome] = serializar(raiz)


def limpar_pacote(partes):
    """Remove relações/partes órfãs (imagens do caso original, SmartArt) e dados pessoais das propriedades.

    As imagens do modelo são prints de documentos de um processo real (com nome
    de parte): precisam sair do arquivo, não só do corpo do documento.
    """
    tipos_midia = ('/image', '/diagramData', '/diagramLayout', '/diagramQuickStyle', '/diagramColors',
                   '/diagramDrawing', '/hyperlink')
    removidos = set()
    for rels_nome in [n for n in list(partes) if n.endswith('.rels') and n.startswith('word/_rels/')]:
        parte = 'word/' + os.path.basename(rels_nome)[:-5]
        if parte not in partes:
            continue
        xml_parte = partes[parte].decode('utf8', errors='replace')
        rels = parse(partes[rels_nome])
        mudou = False
        for rel in list(rels):
            if not rel.get('Type', '').endswith(tipos_midia):
                continue
            rid = rel.get('Id')
            usada = re.search(r'r:\w+="%s"' % re.escape(rid), xml_parte) or re.search(r'relIds[^>]*="%s"' % re.escape(rid), xml_parte)
            if not usada:
                alvo = rel.get('Target')
                if alvo and rel.get('TargetMode') != 'External':
                    removidos.add(os.path.normpath(os.path.join(os.path.dirname(parte), alvo)).replace('\\', '/'))
                rels.remove(rel)
                mudou = True
        if mudou:
            partes[rels_nome] = serializar(rels)
    # só apaga a parte se NENHUMA relação restante aponta para ela
    restantes = set()
    for rels_nome in [n for n in partes if n.endswith('.rels')]:
        base = os.path.dirname(os.path.dirname(rels_nome))
        for rel in parse(partes[rels_nome]):
            if rel.get('TargetMode') == 'External':
                continue
            alvo = rel.get('Target') or ''
            caminho = alvo.lstrip('/') if alvo.startswith('/') else os.path.normpath(os.path.join(base, alvo)).replace('\\', '/')
            restantes.add(caminho)
    for alvo in removidos:
        if alvo not in restantes and alvo in partes:
            del partes[alvo]
    if '[Content_Types].xml' in partes:
        ct = parse(partes['[Content_Types].xml'])
        for ov in list(ct):
            if ov.tag.endswith('Override') and ov.get('PartName', '').lstrip('/') not in partes:
                ct.remove(ov)
        partes['[Content_Types].xml'] = serializar(ct)
    if 'docProps/core.xml' in partes:
        core = partes['docProps/core.xml'].decode('utf8')
        core = re.sub(r'(<dc:creator>)[^<]*(</dc:creator>)', r'\1TributÁgil\2', core)
        core = re.sub(r'(<cp:lastModifiedBy>)[^<]*(</cp:lastModifiedBy>)', r'\1TributÁgil\2', core)
        partes['docProps/core.xml'] = core.encode('utf8')


# ---------------------------------------------------------------------------
# EPE — prescrição ordinária (execução já ajuizada)
# ---------------------------------------------------------------------------

def epe_prescricao(partes):
    raiz = parse(partes['word/document.xml'])
    c = filhos(raiz)
    fonte, tam = rpr_corpo(c[21])

    # Cabeçalho da peça
    definir_texto_paragrafo(c[0], ins('juizo'))
    trocar(c[2], 'xxxxxxx-60.2025.4.01.3300', ins('processo_numero'), 'nº da execução')
    remover_sombreado(c[2])
    qualificacao_nome_e_resto(c[7], 'NOME DO EXECUTADO', 'executado_nome', 'executado_qualif_resto')
    aplicar_tratamento(c[7])
    trocar(c[7], '(Doc. 01)', f'(Doc. {ins("doc_mandato")})', 'doc do mandato')

    # Quadro sinóptico: o fluxograma (SmartArt) vira tabela Tese | Fundamento, 3 linhas geradas pelo código
    quadro = construir_tabela(['Tese', 'Fundamento'], [3200, 5800], [ins('$q.tese'), ins('$q.fundamento')],
                              loop=('q', 'quadro_sinoptico'), fonte=fonte, tamanho=tam)
    c[15].addprevious(quadro)
    remover(c[15])

    # DOS FATOS
    trocar(c[21], 'FULANA DE TAL', ins('executado_nome'), 'dos fatos: nome')
    trocar(c[21], 'X', ins('cdas_lista'), 'dos fatos: CDA')

    # Conceito (texto geral): só o nome da declaração acompanha o tipo extraído
    trocar(c[48], 'DIRPF', ins('tipo_declaracao_principal'), 'conceito: DIRPF')

    # ---- Bloco por CDA: c[54]..c[102] ----
    trocar(c[54], 'X', ins('$cda.numero'), 'título da CDA')
    trocar(c[56], 'X', ins('$cda.numero'), 'intro da CDA')
    trocar(c[56], '(Imposto de Renda - DIRPF)', f'({ins("$cda.tributo_declaracao")})', 'tributo/declaração')
    trocar(c[56], 'dois períodos de apuração, quais sejam 2018 e 2019',
           f'{ins("$cda.n_periodos_texto")} {ins("$cda.periodos_texto")}', 'períodos')

    # Variante A (entrega posterior ao vencimento): c[57]..c[65]
    trocar(c[57], '2018', ins('$p.periodo'), 'A: ano')
    trocar(c[57], '27/01/2020', ins('$p.entrega'), 'A: data de entrega')
    trocar(c[57], '(Doc. 02)', f'(Doc. {ins("$p.doc_recibo")})', 'A: doc recibo')
    limpar_conteudo_paragrafo(c[58], ins('$p.fig_recibo'))
    definir_texto_paragrafo(c[59], ins('$p.fig_recibo_legenda'))
    trocar(c[61], '(Doc. 02 Extrato do Débito)', f'(Doc. {ins("$p.doc_extrato")} Extrato do Débito)', 'A: doc extrato')
    limpar_conteudo_paragrafo(c[62], ins('$p.fig_extrato'))
    definir_texto_paragrafo(c[63], ins('$p.fig_extrato_legenda'))
    trocar(c[65], '2018', ins('$p.periodo'), 'A: período na conclusão')
    trocar(c[65], 'DIRPF', ins('$p.tipo'), 'A: tipo')
    trocar(c[65], '27/01/2020', ins('$p.termo_inicial'), 'A: termo inicial')

    # Variante B (vencimento posterior à entrega): c[66]..c[75]
    trocar(c[66], '2019', ins('$p.periodo'), 'B: período')
    trocar(c[66], 'DIRPF', ins('$p.tipo'), 'B: tipo')
    trocar(c[66], '14/04/2020', ins('$p.entrega'), 'B: entrega')
    trocar(c[66], '(Doc. 04)', f'(Doc. {ins("$p.doc_recibo")})', 'B: doc recibo')
    limpar_conteudo_paragrafo(c[67], ins('$p.fig_recibo'))
    definir_texto_paragrafo(c[68], ins('$p.fig_recibo_legenda'))
    trocar(c[69], '30/06/2020', ins('$p.vencimento'), 'B: vencimento')
    trocar(c[69], 'DIRPF', ins('$p.tipo'), 'B: tipo 2')
    limpar_conteudo_paragrafo(c[72], ins('$p.fig_extrato'))
    remover(c[73])  # 2ª imagem do mesmo extrato
    definir_texto_paragrafo(c[74], ins('$p.fig_extrato_legenda'))

    # laço dos períodos; o docx-templates não tem ELSE, então são dois IF (a 2ª com a condição negada)
    cercar(c[57], c[65], ['FOR p IN $cda.periodos', 'IF $p.entrega_posterior'], ['END-IF'])
    cercar(c[66], c[75], ['IF !$p.entrega_posterior'], ['END-IF', 'END-FOR p'])

    # PAF + figuras
    trocar(c[76], 'X', ins('$cda.paf'), 'PAF')
    limpar_conteudo_paragrafo(c[78], ins('$cda.fig_paf'))
    definir_texto_paragrafo(c[79], ins('$cda.fig_paf_legenda'))

    # Tabelas de prazo (linha-modelo em laço)
    converter_linha_em_loop(c[83], 1, [ins('$l.periodo'), ins('$l.termo_inicial')], 'l', '$cda.tabela_termo_inicial')
    converter_linha_em_loop(c[89], 1, [ins('$l.termo_inicial'), ins('$l.consumacao')], 'l', '$cda.tabela_consumacao')

    # Bloco Decreto 20.910/32 + Lei 9.873/99 isolado num condicional (ver REVISAO_JURIDICA.md)
    cercar(c[85], c[87], ['IF incluir_bloco_decreto_lei'], ['END-IF'])

    # Despacho citatório / ajuizamento / negociações
    trocar(c[91], '29/09/2025', ins('data_despacho_citatorio'), 'despacho citatório')
    limpar_conteudo_paragrafo(c[94], ins('$cda.fig_ajuizamento'))
    limpar_conteudo_paragrafo(c[99], ins('$cda.fig_negociacoes'))
    definir_texto_paragrafo(c[100], ins('$cda.fig_negociacoes_legenda'))
    # a figura do ajuizamento não tinha legenda no modelo: ganha uma, clonada da legenda vizinha
    legenda_aju = copy.deepcopy(c[100])
    definir_texto_paragrafo(legenda_aju, ins('$cda.fig_ajuizamento_legenda'))
    c[94].addnext(legenda_aju)
    trocar(c[98], '30/06/2020 e 30/06/2025', ins('$cda.marcos_citados'), 'marcos citados')

    # Protesto posterior à consumação: um parágrafo por protesto
    trocar(c[102], '03/07/2025', ins('$pr.data'), 'protesto: data')
    trocar(c[102], '30/06/2025', ins('$pr.consumacao_anterior'), 'protesto: consumação')
    cercar(c[102], c[102], ['FOR pr IN $cda.protestos'], ['END-FOR pr'])

    # laço das CDAs envolvendo todo o bloco c[54]..c[102]
    c[54].addprevious(para_cmd('FOR cda IN cdas'))
    c[102].getnext().addnext(para_cmd('END-FOR cda'))  # depois do END-FOR pr

    # Linha do tempo: tabela de marcos, no lugar das formas desenhadas
    linha = construir_tabela(['Data', 'Evento', 'Documento-fonte'], [1500, 4500, 3000],
                             [ins('$m.data'), ins('$m.evento'), ins('$m.fonte')], loop=('m', 'linha_do_tempo'),
                             fonte=fonte, tamanho=tam)
    c[104].addprevious(linha)
    remover(c[104])
    remover(c[105])

    # Fecho
    marcador = cmd('IF tem_protesto')
    exigir(trocar_entre(c[110], ', bem como o', 'executado', lambda t: f'{marcador}{t}{cmd("END-IF")}'), 'pedido: protesto (1)')
    trocar(c[110], '50 1 23 023733-90', ins('cdas_lista'), 'pedido: inscrição')
    trocar(c[113], '50 1 23 023733-90', ins('cdas_lista'), 'pedidos: inscrição')
    exigir(trocar_entre(c[113], ', ao', 'executado', lambda t: f'{marcador}{t}{cmd("END-IF")}'), 'pedidos: protesto (2)')
    definir_texto_paragrafo(c[118], ins('fecho_local_data'))
    assinatura(c, 123, 125, 122, 121)

    partes['word/document.xml'] = serializar(raiz)


# ---------------------------------------------------------------------------
# EPE — decadência (execução já ajuizada)
# ---------------------------------------------------------------------------

def epe_decadencia(partes):
    raiz = parse(partes['word/document.xml'])
    c = filhos(raiz)
    fonte, tam = rpr_corpo(c[20])

    definir_texto_paragrafo(c[2], ins('juizo'))
    trocar(c[5], 'xxxxxx', ins('processo_numero'), 'nº do processo')
    trocar(c[7], 'NOME DO(A) EXECUTADO(A)', ins('executado_nome'), 'nome na abertura')
    aplicar_tratamento(c[7])

    # DOS FATOS (colchetes do modelo viram campos)
    remover_sombreado(c[20])
    trocar(c[20], '[NOME DO EXECUTADO]', ins('executado_nome'), 'fatos: nome')
    trocar(c[20], '[NÚMERO]', ins('cdas_lista'), 'fatos: CDA')
    trocar(c[20], '[AUTO DE INFRAÇÃO / LANÇAMENTO DE OFÍCIO / LANÇAMENTO POR HOMOLOGAÇÃO]', ins('origem_lancamento'), 'fatos: origem')
    trocar(c[20], '[TRIBUTO]', ins('tributo'), 'fatos: tributo')
    trocar(c[20], '[PERÍODO(S)]', ins('periodos_apuracao'), 'fatos: períodos')

    # "]" solto no fim do parágrafo que anuncia a demonstração (erro de contexto do modelo)
    trocar(c[54], 'no caso em apreço.]', 'no caso em apreço.', 'colchete solto')

    # ---- Bloco por período (c[59]..c[65]) ----
    for i in (59, 60, 61, 65):
        remover_sombreado(c[i])
    trocar(c[59], '[NÚMERO]', ins('$p.cda'), 'período: CDA')
    trocar(c[59], '[POR HOMOLOGAÇÃO / DE OFÍCIO]', ins('$p.modalidade'), 'período: modalidade')
    trocar(c[59], '[PERÍODO(S)]', ins('$p.periodo'), 'período: período')
    trocar(c[60], '[DATA DO FATO GERADOR]', ins('$p.fato_gerador'), 'período: fato gerador')
    trocar(c[60], '[REALIZADO / NÃO REALIZADO]', ins('$p.pagamento'), 'período: pagamento')
    trocar(c[60], '[COMPROVANTE/DOC. XX]', ins('$p.doc_comprovante'), 'período: comprovante')
    # a escolha entre art. 150 §4º e art. 173, I deixa de ser instrução ao advogado e vira lógica do motor
    trocar(c[61], '[DATA DO MARCO INICIAL — conforme art. 150, § 4º, ou art. 173, I, do CTN]',
           f'{ins("$p.marco_inicial")} ({ins("$p.artigo_marco")})', 'período: marco inicial')
    trocar(c[61], '[DATA DO TERMO FINAL — marco inicial + 5 anos]', ins('$p.termo_final'), 'período: termo final')
    trocar(c[61], ' (Escolha o que encaixa a seu caso)', '', 'instrução "Escolha o que encaixa"')
    trocar(c[65], '[DATA]', ins('$p.notificacao'), 'período: notificação')

    # Tabela Marco | Data | Fundamento: 4 linhas por período, geradas pelo código
    tbl = c[63].find('.//w:tbl', NS) if c[63].tag != q('tbl') else c[63]
    converter_linha_em_loop(tbl, 1, [ins('$l.marco'), ins('$l.data'), ins('$l.fundamento')], 'l', '$p.linhas')

    cercar(c[59], c[65], ['FOR p IN periodos_decadencia'], ['END-FOR p'])

    # Linha do tempo (formas desenhadas, vazia no modelo) -> tabela de marcos
    linha = construir_tabela(['Data', 'Evento', 'Documento-fonte'], [1500, 4500, 3000],
                             [ins('$m.data'), ins('$m.evento'), ins('$m.fonte')], loop=('m', 'linha_do_tempo'),
                             fonte=fonte, tamanho=tam)
    c[71].addprevious(linha)
    remover(c[71])
    remover(c[72])

    # Pedidos e fecho
    trocar(c[79], 'Fulana de Tal', ins('executado_nome'), 'pedidos: nome')
    definir_texto_paragrafo(c[81], ins('fecho_local_data'))
    assinatura(c, 86, 91, 84, 83)

    partes['word/document.xml'] = serializar(raiz)


# ---------------------------------------------------------------------------
# Revisão de Débito Fiscal (PGFN) — prescrição ordinária, SEM execução ajuizada
# ---------------------------------------------------------------------------

def revisao_pgfn(partes):
    raiz = parse(partes['word/document.xml'])
    c = filhos(raiz)
    fonte, tam = rpr_corpo(c[14])

    definir_texto_paragrafo(c[1], ins('destinatario_pgfn'))
    trocar(c[3], 'xxxxxxx', ins('cdas_lista'), 'CDA no cabeçalho')
    qualificacao_nome_e_resto(c[7], 'NOME DO DEVEDOR', 'devedor_nome', 'devedor_qualif_resto')
    aplicar_tratamento(c[7])
    trocar(c[7], '(Doc. 01)', f'(Doc. {ins("doc_mandato")})', 'doc do mandato')

    trocar(c[14], 'NOME DO DEVEDOR', ins('devedor_nome'), 'fatos: nome')
    trocar(c[14], 'X', ins('cdas_lista'), 'fatos: CDA')
    trocar(c[49], 'DIRPF', ins('tipo_declaracao_principal'), 'conceito: DIRPF')

    # ---- Bloco por CDA: c[55]..c[98] (mesma estrutura da EPE de prescrição, índices deslocados) ----
    trocar(c[55], 'X', ins('$cda.numero'), 'título da CDA')
    trocar(c[57], 'X', ins('$cda.numero'), 'intro da CDA')
    trocar(c[57], '(Imposto de Renda - DIRPF)', f'({ins("$cda.tributo_declaracao")})', 'tributo/declaração')
    trocar(c[57], 'dois períodos de apuração, quais sejam 2018 e 2019',
           f'{ins("$cda.n_periodos_texto")} {ins("$cda.periodos_texto")}', 'períodos')

    # Variante A (entrega posterior ao vencimento): c[58]..c[66]
    trocar(c[58], '2018', ins('$p.periodo'), 'A: ano')
    # linguagem administrativa: "Executada/Exequente" é vocabulário de processo judicial
    trocar(c[58], 'pela Executada', 'pela Devedora', 'A: Executada -> Devedora')
    trocar(c[58], 'pela Exequente', 'pela Fazenda Nacional', 'A: Exequente -> Fazenda Nacional')
    trocar(c[58], '27/01/2020', ins('$p.entrega'), 'A: data de entrega')
    trocar(c[58], '(Doc. 02)', f'(Doc. {ins("$p.doc_recibo")})', 'A: doc recibo')
    limpar_conteudo_paragrafo(c[59], ins('$p.fig_recibo'))
    definir_texto_paragrafo(c[60], ins('$p.fig_recibo_legenda'))
    trocar(c[62], '(Doc. 02 Extrato do Débito)', f'(Doc. {ins("$p.doc_extrato")} Extrato do Débito)', 'A: doc extrato')
    limpar_conteudo_paragrafo(c[63], ins('$p.fig_extrato'))
    definir_texto_paragrafo(c[64], ins('$p.fig_extrato_legenda'))
    trocar(c[66], '2018', ins('$p.periodo'), 'A: período na conclusão')
    trocar(c[66], 'DIRPF', ins('$p.tipo'), 'A: tipo')
    trocar(c[66], '27/01/2020', ins('$p.termo_inicial'), 'A: termo inicial')

    # Variante B (vencimento posterior à entrega): c[67]..c[76]
    trocar(c[67], '2019', ins('$p.periodo'), 'B: período')
    trocar(c[67], 'DIRPF', ins('$p.tipo'), 'B: tipo')
    trocar(c[67], '14/04/2020', ins('$p.entrega'), 'B: entrega')
    trocar(c[67], '(Doc. 04)', f'(Doc. {ins("$p.doc_recibo")})', 'B: doc recibo')
    limpar_conteudo_paragrafo(c[68], ins('$p.fig_recibo'))
    definir_texto_paragrafo(c[69], ins('$p.fig_recibo_legenda'))
    trocar(c[70], '30/06/2020', ins('$p.vencimento'), 'B: vencimento')
    trocar(c[70], 'DIRPF', ins('$p.tipo'), 'B: tipo 2')
    limpar_conteudo_paragrafo(c[73], ins('$p.fig_extrato'))
    remover(c[74])
    definir_texto_paragrafo(c[75], ins('$p.fig_extrato_legenda'))

    cercar(c[58], c[66], ['FOR p IN $cda.periodos', 'IF $p.entrega_posterior'], ['END-IF'])
    cercar(c[67], c[76], ['IF !$p.entrega_posterior'], ['END-IF', 'END-FOR p'])

    # PAF + figuras ("dessa execução" não faz sentido num pedido administrativo)
    trocar(c[77], 'X', ins('$cda.paf'), 'PAF')
    trocar(c[77], 'dessa execução', 'dessa inscrição em dívida ativa', '"execução" no pedido administrativo')
    limpar_conteudo_paragrafo(c[79], ins('$cda.fig_paf'))
    definir_texto_paragrafo(c[80], ins('$cda.fig_paf_legenda'))

    converter_linha_em_loop(c[84], 1, [ins('$l.periodo'), ins('$l.termo_inicial')], 'l', '$cda.tabela_termo_inicial')
    converter_linha_em_loop(c[90], 1, [ins('$l.termo_inicial'), ins('$l.consumacao')], 'l', '$cda.tabela_consumacao')
    cercar(c[86], c[88], ['IF incluir_bloco_decreto_lei'], ['END-IF'])

    trocar(c[92], 'xxxxxx', ins('data_geracao'), 'data até o presente')
    limpar_conteudo_paragrafo(c[95], ins('$cda.fig_negociacoes'))
    definir_texto_paragrafo(c[96], ins('$cda.fig_negociacoes_legenda'))
    trocar(c[94], '30/06/2020 e 30/06/2025', ins('$cda.marcos_citados'), 'marcos citados')

    trocar(c[98], '03/07/2025', ins('$pr.data'), 'protesto: data')
    trocar(c[98], '30/06/2025', ins('$pr.consumacao_anterior'), 'protesto: consumação')
    cercar(c[98], c[98], ['FOR pr IN $cda.protestos'], ['END-FOR pr'])
    c[55].addprevious(para_cmd('FOR cda IN cdas'))
    c[98].getnext().addnext(para_cmd('END-FOR cda'))  # depois do END-FOR pr

    # Linha do tempo -> tabela (as formas c[104]/c[105] saem)
    linha = construir_tabela(['Data', 'Evento', 'Documento-fonte'], [1500, 4500, 3000],
                             [ins('$m.data'), ins('$m.evento'), ins('$m.fonte')], loop=('m', 'linha_do_tempo'),
                             fonte=fonte, tamanho=tam)
    c[104].addprevious(linha)
    remover(c[104])
    remover(c[105])

    # Frase truncada do modelo ("...ao promover a presente c"): completada com o mesmo trecho da EPE de
    # prescrição, sem "executiva" por ser pedido administrativo. Registrado em REVISAO_JURIDICA.md.
    trocar(c[107], 'a presente c',
           'a presente cobrança, baseada em crédito que claramente não desfruta das características de certeza, liquidez e exigibilidade.',
           'frase truncada')

    trocar(c[108], 'xxxxxx', ins('cdas_lista'), 'pedido: inscrição')
    trocar(c[108], 'ao executado', 'ao devedor', 'ao executado -> ao devedor')
    marcador = cmd('IF tem_protesto')
    exigir(trocar_entre(c[108], ', bem como o', 'devedor', lambda t: f'{marcador}{t}{cmd("END-IF")}'), 'pedido: protesto')
    trocar(c[111], 'xxxxxx', ins('cdas_lista'), 'pedidos: inscrição')
    definir_texto_paragrafo(c[114], ins('fecho_local_data'))
    assinatura(c, 119, 121, 118, 117)

    partes['word/document.xml'] = serializar(raiz)


def montar(nome_original, nome_saida, transformacao):
    partes, ordem = ler_docx(os.path.join(ORIGINAIS, nome_original + '.docx'))
    transformacao(partes)
    logo_cabecalho(partes)
    rodape(partes)
    limpar_pacote(partes)
    escrever_docx(os.path.join(SAIDA, nome_saida + '.docx'), partes, [n for n in ordem if n in partes])
    print('gerado:', nome_saida)


if __name__ == '__main__':
    montar('EPE_prescricao_ordinaria', 'EPE_prescricao_ordinaria', epe_prescricao)
    montar('EPE_decadencia', 'EPE_decadencia', epe_decadencia)
    montar('Revisao_PGFN_prescricao_ordinaria', 'Revisao_PGFN_prescricao_ordinaria', revisao_pgfn)

    # Modelos novos (texto jurídico integral do prompt da advogada) — ver novos_modelos.py
    from novos_modelos import revisao_decadencia, epe_intercorrente

    montar('Revisao_PGFN_prescricao_ordinaria', 'Revisao_PGFN_decadencia', revisao_decadencia)
    montar('EPE_decadencia', 'EPE_prescricao_intercorrente', epe_intercorrente)
