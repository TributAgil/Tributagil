"""Gera um PDF FICTÍCIO por caso (cenarios.json). Texto selecionável, uma tarja "DOCUMENTO FICTICIO" em cada
página, e em cada documento todos os dados de que o sistema precisa (vencimento, entrega da declaração, auto de
infração, notificação, pagamento, ocorrências, ajuizamento, andamentos da execução).

    python scripts/casos-ficticios/gerar_pdfs.py [pasta-de-saida]
"""
import json
import os
import sys
import textwrap
from datetime import datetime, timedelta

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.pdfgen import canvas

AQUI = os.path.dirname(os.path.abspath(__file__))
SAIDA = sys.argv[1] if len(sys.argv) > 1 else os.path.join(AQUI, '..', '..', 'exemplos', 'casos-ficticios')
W, H = A4
LARGURA = 82

OBJETO = {'devedor': 'do devedor', 'bens': 'de bens penhoraveis', 'devedor_e_bens': 'do devedor e de bens penhoraveis'}


def somar_dias(data, dias):
    return (datetime.strptime(data, '%d/%m/%Y') + timedelta(days=dias)).strftime('%d/%m/%Y')


def ordem(data):
    return datetime.strptime(data, '%d/%m/%Y')


class Doc:
    def __init__(self, caminho, titulo):
        self.c = canvas.Canvas(caminho, pagesize=A4)
        self.c.setTitle(titulo)
        self.n = 0

    def pagina(self, titulo, linhas):
        """Quebra linhas longas e continua em outra página se passar do limite."""
        todas = []
        for ln in linhas:
            negrito = ln.startswith('##')
            txt = ln[2:] if negrito else ln
            partes = textwrap.wrap(txt, LARGURA, subsequent_indent='  ') or ['']
            todas += [('##' if negrito else '') + p for p in partes]
        por_pagina = 46
        for i in range(0, max(len(todas), 1), por_pagina):
            self._desenhar(titulo + (' (cont.)' if i else ''), todas[i:i + por_pagina])

    def _desenhar(self, titulo, linhas):
        c = self.c
        self.n += 1
        c.setFillColorRGB(0.75, 0.1, 0.1)
        c.setFont('Helvetica-Bold', 9)
        c.drawString(2 * cm, H - 1.2 * cm, 'DOCUMENTO FICTICIO PARA TESTE - SEM VALOR JURIDICO - PARTES E DADOS INVENTADOS')
        c.saveState()
        c.setFillColorRGB(0.93, 0.93, 0.93)
        c.setFont('Helvetica-Bold', 60)
        c.translate(W / 2, H / 2)
        c.rotate(35)
        c.drawCentredString(0, 0, 'FICTICIO - TESTE')
        c.restoreState()
        c.setFillColorRGB(0, 0, 0)
        c.setFont('Courier-Bold', 11)
        c.drawCentredString(W / 2, H - 2.6 * cm, titulo)
        y = H - 4 * cm
        for ln in linhas:
            neg = ln.startswith('##')
            c.setFont('Courier-Bold' if neg else 'Courier', 10)
            c.drawString(2 * cm, y, ln[2:] if neg else ln)
            y -= 0.5 * cm
        c.setFont('Courier', 8)
        c.drawString(2 * cm, 1.5 * cm, f'F.{self.n:04d}')
        c.showPage()

    def fechar(self):
        self.c.save()


def valor(i, k):
    base = 4000 + 1370 * (i + 1) + 310 * (k + 1)
    return f'{base:,.2f}'.replace(',', 'X').replace('.', ',').replace('X', '.')


def gerar(c, destino):
    d = Doc(destino, f"{c['id']} {c['titulo']}")
    parte, ex = c['parte'], c['execucao']
    cdas = c['cdas']
    numeros = ', '.join(x['numero'] for x in cdas)
    rotulo_doc = 'CNPJ' if parte['tipo'] == 'PJ' else 'CPF'
    credor = 'UNIAO (FAZENDA NACIONAL)' if c['ente'] == 'União' else 'ESTADO DA BAHIA'
    orgao = 'Procuradoria-Geral da Fazenda Nacional' if c['ente'] == 'União' else 'Procuradoria-Geral do Estado'

    cab_parte = [f"Devedor: {parte['nome']}", f"{rotulo_doc}: {parte['doc']}", f"Endereco: {parte['endereco'].upper()}"]

    if ex:
        d.pagina('PODER JUDICIARIO - TERMO DE AUTUACAO', [
            f"Em Salvador, {ex['ajuizamento']}, a secao de Classificacao e Distribuicao autua os",
            'documentos adiante, na seguinte conformidade:', '',
            f"Processo: {ex['numero']}", 'Classe:   3100 - EXECUCAO FISCAL', f"Vara:     {ex['vara']} - {ex['secao']}",
            f"DISTRIBUICAO AUTOMATICA EM {ex['ajuizamento']}", '', 'PARTES:',
            f"EXEQUENTE   {ex['exequente']}", f"EXECUTADO   {parte['nome']}  {rotulo_doc}: {parte['doc']}", '',
            'Para constar, lavro e assino o presente. Servidor (nome ficticio).',
        ])
        d.pagina('PETICAO INICIAL - EXECUCAO FISCAL', [
            f"EXMO. SR. JUIZ DA {ex['vara']} - {ex['secao'].upper()}", '',
            f"{ex['exequente']}, com fundamento na Lei no. 6.830/1980, propoe a presente EXECUCAO FISCAL contra:",
            *cab_parte, '',
            f"para cobranca das dividas inscritas sob os numeros: {numeros}, conforme as anexas certidoes de Divida Ativa.", '',
            'Requer a citacao da executada, nos termos do art. 8o da Lei no. 6.830/1980, para pagar ou garantir a execucao, e,',
            'nao paga a divida, a penhora e avaliacao de bens bastantes a garantia integral.', '',
            f"{ex['secao'].split(' de ')[-1]}, {ex['ajuizamento']}.",
            'Procurador (nome ficticio) - OAB/BA 00000',
        ])
    else:
        d.pagina('TERMO DE INSCRICAO EM DIVIDA ATIVA - SITUACAO', [
            orgao, *cab_parte, '',
            f'Inscricoes: {numeros}', 'Data da inscricao: 14/05/2018', '',
            f"Consulta ao sistema da divida ativa em {c['agora']}: NAO CONSTA execucao fiscal ajuizada para as",
            'inscricoes acima. Os creditos permanecem inscritos e exigiveis administrativamente.',
        ])

    # ---- CDAs e autos de infração
    for i, cda in enumerate(cdas):
        linhas = [f"Origem: {orgao}", f"Numero da Inscricao: {cda['numero']}", f"Data da Inscricao: {cda['inscricao']}",
                  f"Processo Administrativo: {cda['pa']}", *cab_parte, '', f"##Natureza do credito: {cda['tributo']}", '']
        oficiais = []
        for k, p in enumerate(cda['periodos']):
            linhas.append(f"##Periodo de apuracao: {p['periodo']}")
            if p['modalidade'] == 'homologacao_declarado':
                if p.get('vencimento'):
                    linhas.append(f"Data de vencimento da obrigacao: {p['vencimento']}")
                if p.get('entrega'):
                    linhas.append(f"Declaracao: {p.get('declaracao') or 'declaracao'} entregue pelo contribuinte em {p['entrega']}")
                linhas.append('Origem: debito declarado pelo contribuinte e nao pago (lancamento por homologacao).')
            else:
                if p.get('vencimento'):
                    linhas.append(f"Data de vencimento da obrigacao: {p['vencimento']}")
                linhas.append('Origem: Auto de Infracao (lancamento de oficio); ver auto de infracao anexo.')
                oficiais.append(p)
            linhas.append(f"Valor consolidado: R$ {valor(i, k)}")
            linhas.append('')
        linhas += ['Fundamento legal: Lei no. 5.172/1966 (CTN); legislacao especifica do tributo; juros SELIC; multa conforme a lei.']
        d.pagina('CERTIDAO DE DIVIDA ATIVA (CDA)', linhas)

        for p in oficiais:
            a = [f"AUTO DE INFRACAO E NOTIFICACAO DE LANCAMENTO - {cda['tributo']}", f"Processo Administrativo: {cda['pa']}",
                 f"Autuado: {parte['nome']} - {rotulo_doc} {parte['doc']}", '',
                 f"##Periodo de apuracao: {p['periodo']}", f"Fato gerador: {p['fato_gerador']}"]
            if p.get('vencimento'):
                a.append(f"Data de vencimento do tributo: {p['vencimento']}")
            if p['pagamento'] == 'sim':
                a.append(f"Pagamento antecipado: houve recolhimento parcial antes do lancamento ({p.get('fonte_pagamento') or 'comprovante anexo'}).")
            elif p['pagamento'] == 'não':
                a.append('Pagamento antecipado: NAO houve nenhum recolhimento do tributo no periodo.')
            if p['dolo'] == 'sim':
                a.append('Multa qualificada de 150% por evidente intuito de fraude e sonegacao (art. 44, par. 1o, Lei no. 9.430/96).')
            elif p['dolo'] == 'não':
                a.append('Multa de oficio de 75%. Nao ha imputacao de dolo, fraude ou simulacao ao contribuinte.')
            if p['vicio'] == 'sim':
                a.append(f"Lancamento anterior do mesmo periodo foi ANULADO por vicio formal (decisao de {p.get('anulacao')}); este e o novo lancamento.")
            elif p['vicio'] == 'não':
                a.append('Nao ha lancamento anterior anulado para este periodo.')
            if p.get('notificacao'):
                a += ['', f"##CIENCIA DO CONTRIBUINTE: notificado do lancamento em {p['notificacao']}."]
            a.append('Autoridade fiscal (nome ficticio).')
            d.pagina('AUTO DE INFRACAO - NOTIFICACAO', a)

    # ---- Extrato de débito / ocorrências
    ocorr = ['##Inscricao        Ocorrencias registradas']
    for cda in cdas:
        if cda['eventos']:
            for e in cda['eventos']:
                ocorr.append(f"{cda['numero']:<16} {e['tipo'].upper()} em {e['data']}")
        else:
            ocorr.append(f"{cda['numero']:<16} nenhum parcelamento, pagamento, compensacao ou protesto")
    d.pagina('EXTRATO DE DEBITO - OCORRENCIAS DAS INSCRICOES', [
        orgao, *cab_parte, f"Consulta em: {c['agora']}", '', *ocorr, '',
        'Quando a ocorrencia e protesto: registrada pelo Tabelionato de Protesto (nome ficticio).'])

    # ---- Execução: citação e andamentos
    if ex:
        citacoes = [e for e in ex['eventos'] if e['categoria'] == 'citacao']
        d.pagina('DESPACHO / CARTA DE CITACAO', [
            f"Processo: {ex['numero']}", f"Exequente: {ex['exequente']}", f"Executado: {parte['nome']}", '', '##DESPACHO',
            f"Cite-se a executada para pagar a divida ou garantir a execucao (art. 8o da Lei no. 6.830/1980). {somar_dias(ex['ajuizamento'], 9)}.",
            'Juiz (nome ficticio).', '', '##RESULTADO DA CITACAO POSTAL',
            'AR devolvido com a informacao "MUDOU-SE": citacao postal NEGATIVA.'])
        andamentos = [(ex['ajuizamento'], 'Distribuicao automatica - execucao fiscal ajuizada'),
                      (somar_dias(ex['ajuizamento'], 9), 'Despacho: cite-se'),
                      (somar_dias(ex['ajuizamento'], 25), 'AR devolvido - citacao postal negativa (mudou-se)')]
        for e in sorted(ex['eventos'], key=lambda x: ordem(x['data'])):
            dta, cat = e['data'], e['categoria']
            ref = f" (referente a CDA {e['inscricao']})" if e.get('inscricao') else ''
            if cat == 'intimacao_nao_localizacao_bens':
                t = f"Fazenda intimada em {dta}; TOMOU CIENCIA da NAO LOCALIZACAO {OBJETO[e['objeto']].upper()}{ref}"
                d.pagina('INTIMACAO / MANIFESTACAO DA FAZENDA - NAO LOCALIZACAO', [
                    f"Processo: {ex['numero']}", '',
                    f"A Fazenda foi INTIMADA em {dta} da certidao do oficial de justica e TOMOU CIENCIA, em {dta}, da NAO",
                    f"LOCALIZACAO {OBJETO[e['objeto']].upper()}{ref.upper()}.", '',
                    'Requer a suspensao da execucao fiscal, nos termos do art. 40 da Lei no. 6.830/1980.', 'Procurador (nome ficticio).'])
            elif cat == 'requerimento_constricao':
                t = f"Fazenda requer penhora de ativos financeiros (Sisbajud), protocolo em {dta}; sem resultado informado"
                d.pagina('REQUERIMENTO DA FAZENDA - PENHORA (SISBAJUD)', [
                    f"Processo: {ex['numero']}", '', f"Em {dta} (data do protocolo), a Fazenda requer a penhora de ativos financeiros da",
                    'executada via Sisbajud. Ate a presente data nao ha informacao de resultado do bloqueio.', 'Procurador (nome ficticio).'])
            elif cat == 'penhora_constricao':
                t = f"Penhora EFETIVADA em {dta} (bloqueio via Sisbajud)"
                d.pagina('AUTO DE PENHORA', [
                    f"Processo: {ex['numero']}", '', f"Em {dta} foi EFETIVADA a penhora de R$ 8.452,10 em conta da executada (bloqueio Sisbajud",
                    'positivo, convertido em penhora).', 'Servidor (nome ficticio).'])
            else:
                t = f"Executada CITADA em {dta} (citacao por edital)"
                d.pagina('CERTIDAO DE CITACAO', [
                    f"Processo: {ex['numero']}", '', f"Certifico que a executada foi CITADA em {dta}, por edital, esgotados os meios de localizacao.",
                    'Servidor (nome ficticio).'])
            andamentos.append((dta, t))
        andamentos.sort(key=lambda x: ordem(x[0]))
        mov = [f'{a[0]}  {a[1]}' for a in andamentos]
        mov.append(f"Ultima movimentacao registrada ate {c['agora']}. Nao ha outros atos no periodo.")
        d.pagina('MOVIMENTACAO PROCESSUAL', [f"Processo: {ex['numero']}", '', *mov])
    d.fechar()
    return d.n


def main():
    os.makedirs(SAIDA, exist_ok=True)
    with open(os.path.join(AQUI, 'cenarios.json'), encoding='utf-8') as f:
        casos = json.load(f)
    for c in casos:
        n = gerar(c, os.path.join(SAIDA, f"{c['id']}.pdf"))
        print(f"{c['id']}.pdf  {n} paginas  {c['titulo']}")
    print(len(casos), 'PDFs em', os.path.abspath(SAIDA))


if __name__ == '__main__':
    main()
