"""Especificação ÚNICA dos casos fictícios de teste (decadência, prescrição ordinária e prescrição
intercorrente). Dela saem: os PDFs (gerar_pdfs.py), o gabarito (gerar-gabarito.mjs) e o teste automático
(tests/casos-ficticios.test.js), que confere se o motor chega ao resultado para o qual o caso foi desenhado.

Tudo é inventado: partes, CNPJ/CPF, números de CDA/processo e datas. "Hoje" = 12/10/2026.

`esperado` = o que o motor deve devolver em avaliarPecas() quando o parecer concorda com ele
(`parecer_favoravel` lista as teses que o parecer da IA deve dar como favoráveis):
  { tese: 'ok' | 'bloqueada' }  e `template` quando ok.  Tese ausente = não aparece (sem peça).
"""
import json
import os

AGORA = '12/10/2026'

PF = dict(tipo='PF', nome='MARTA EXEMPLO LIMA', doc='111.111.111-11', nacionalidade='brasileira', estado_civil='casada',
          profissao='professora', endereco='Rua das Acacias, 45, Centro, Cidade Ficticia/BA')
PJ = dict(tipo='PJ', nome='SABOR DA TERRA REFEICOES INDUSTRIAIS LTDA', doc='11.222.333/0001-81',
          endereco='Rua das Palmeiras, 100, Zona Rural, Cidade Ficticia/BA')
PJ2 = dict(tipo='PJ', nome='COMERCIAL HORIZONTE DISTRIBUIDORA LTDA', doc='22.333.444/0001-55',
           endereco='Av. do Comercio, 900, Distrito Industrial, Cidade Ficticia/BA')

EP = 'EPE_prescricao_ordinaria'
ED = 'EPE_decadencia'
EI = 'EPE_prescricao_intercorrente'
RP = 'Revisao_PGFN_prescricao_ordinaria'
RD = 'Revisao_PGFN_decadencia'
PO, DE, IN = 'prescricao_ordinaria', 'decadencia', 'prescricao_intercorrente'


def exec_(numero, ajuiz, eventos=None, ente='União'):
    return dict(numero=numero, vara='2a VARA FEDERAL DE EXECUCAO FISCAL' if ente == 'União' else '3a VARA DA FAZENDA PUBLICA',
                secao='Subsecao Judiciaria de Salvador' if ente == 'União' else 'Comarca de Salvador',
                ajuizamento=ajuiz, despacho=None, exequente='UNIAO (FAZENDA NACIONAL)' if ente == 'União' else 'ESTADO DA BAHIA',
                eventos=eventos or [])


def decl(periodo, venc, entrega, tipo='DIRPF'):
    return dict(periodo=periodo, modalidade='homologacao_declarado', declaracao=tipo, vencimento=venc, entrega=entrega)


def ofic(periodo, fg, venc, notif, pagamento='não', dolo='não', vicio='não', fonte_pagto='', anulacao='', modalidade='oficio'):
    return dict(periodo=periodo, modalidade=modalidade, fato_gerador=fg, vencimento=venc, notificacao=notif, pagamento=pagamento,
                fonte_pagamento=fonte_pagto, dolo=dolo, vicio=vicio, anulacao=anulacao)


def cda(numero, tributo, periodos, eventos=None, pa=None):
    return dict(numero=numero, tributo=tributo, pa=pa or f'10001.{numero[-5:-2]}000/2018-11', inscricao='14/05/2018', periodos=periodos, eventos=eventos or [])


def ev(tipo, data):
    return dict(tipo=tipo, data=data)


def ee(categoria, data, objeto='devedor_e_bens', inscricao=''):
    return dict(categoria=categoria, data=data, objeto=objeto, inscricao=inscricao)


def caso(id, titulo, descricao, parte, cdas, execucao=None, ente='União', esperado=None, parecer=None, **extra):
    c = dict(id=id, titulo=titulo, descricao=descricao, parte=parte, ente=ente, orgao='PGFN' if ente == 'União' else 'PGE',
             execucao=execucao, cdas=cdas, esperado=esperado or {}, parecer_favoravel=parecer if parecer is not None else list((esperado or {}).keys()),
             agora=AGORA)
    c.update(extra)
    return c


CENARIOS = [
    # ------------------------------------------------------------------ PRESCRIÇÃO ORDINÁRIA
    caso('P01', 'Prescrição ordinária total, execução ajuizada (EPE)',
         'DIRPF 2018 (entrega depois do vencimento) e 2019 (vencimento depois da entrega). Ajuizamento depois das duas consumações. Protesto posterior vira só aviso.',
         PF, [cda('50.100.001-1', 'Imposto de Renda Pessoa Fisica', [decl('2018', '30/04/2019', '27/01/2020'), decl('2019', '30/06/2020', '14/04/2020')], [ev('protesto', '03/07/2025')])],
         execucao=exec_('1000001-10.2025.4.01.3300', '20/09/2025'), esperado={PO: 'ok'}, template={PO: EP}),
    caso('P02', 'Prescrição parcial: 2 períodos prescritos e 1 dentro do prazo (EPE)',
         'GFIP: competências 01/2012 e 02/2012 prescritas; 06/2014 não. A peça sai só com as prescritas e avisa do período que ficou de fora.',
         PJ, [cda('50.100.002-1', 'Contribuicoes previdenciarias', [decl('01/2012', '20/02/2012', '15/02/2012', 'GFIP'), decl('02/2012', '20/03/2012', '14/03/2012', 'GFIP'), decl('06/2014', '20/07/2014', '21/07/2014', 'GFIP')])],
         execucao=exec_('1000002-10.2019.4.01.3300', '12/03/2019'), esperado={PO: 'ok'}, template={PO: EP}),
    caso('P03', 'Prescrição ordinária sem execução (Revisão PGFN)',
         'Só inscrição em dívida ativa, sem execução. Aferida até a data de geração da peça (12/10/2026). Protesto posterior à consumação vira aviso.',
         PF, [cda('50.100.003-1', 'Imposto de Renda Pessoa Fisica', [decl('2016', '30/04/2017', '28/04/2017'), decl('2017', '30/04/2018', '10/05/2018')], [ev('protesto', '15/09/2023')])],
         esperado={PO: 'ok'}, template={PO: RP}),
    caso('P04', 'Sem prescrição: ajuizamento dentro do prazo',
         'Termo inicial em 22/06/2021 e consumação em 22/06/2026; execução ajuizada em 10/05/2024. O parecer deve ser DESFAVORÁVEL e não há peça.',
         PJ2, [cda('50.100.004-1', 'Contribuicoes previdenciarias', [decl('05/2021', '20/06/2021', '22/06/2021', 'GFIP')])],
         execucao=exec_('1000004-10.2024.4.01.3300', '10/05/2024'), esperado={}, parecer=[]),
    caso('P05', 'Caso-limite: ajuizamento NO DIA da consumação (não prescreve)',
         'Termo inicial em 15/02/2017, consumação em 15/02/2022; ajuizamento em 15/02/2022. Só é prescrito se o ajuizamento for POSTERIOR.',
         PF, [cda('50.100.005-1', 'Imposto de Renda Pessoa Fisica', [decl('2016', '15/02/2017', '10/02/2017')])],
         execucao=exec_('1000005-10.2022.4.01.3300', '15/02/2022'), esperado={}, parecer=[]),
    caso('P06', 'Bloqueio: parcelamento dentro do prazo',
         'Prescrição aparente, mas há parcelamento em 15/05/2020 (dentro do prazo). O sistema não gera a peça e manda para análise manual.',
         PF, [cda('50.100.006-1', 'Imposto de Renda Pessoa Fisica', [decl('2017', '10/03/2018', '05/03/2018')], [ev('parcelamento', '15/05/2020')])],
         execucao=exec_('1000006-10.2025.4.01.3300', '20/09/2025'), esperado={PO: 'bloqueada'}),
    caso('P07', 'Bloqueio: faltam datas de vencimento e de entrega',
         'O documento não traz o vencimento nem a entrega da declaração. Sem as datas o sistema não calcula (é o caso do processo real da J E J).',
         PJ, [cda('50.100.007-1', 'Contribuicoes previdenciarias', [decl('03/2012', None, None, 'GFIP')])],
         execucao=exec_('1000007-10.2019.4.01.3300', '12/03/2019'), esperado={PO: 'bloqueada'}),
    caso('P08', 'Bloqueio: protesto DENTRO do prazo (pode interromper)',
         'Termo inicial 10/03/2018; protesto em 20/08/2020, dentro dos 5 anos. O sistema bloqueia e pede análise manual.',
         PF, [cda('50.100.008-1', 'Imposto de Renda Pessoa Fisica', [decl('2017', '10/03/2018', '01/03/2018')], [ev('protesto', '20/08/2020')])],
         execucao=exec_('1000008-10.2025.4.01.3300', '20/09/2025'), esperado={PO: 'bloqueada'}),
    caso('P09', 'Sem execução e ainda dentro do prazo (nada a pedir)',
         'Inscrição sem execução; termo inicial 20/03/2023, consumação 20/03/2028. Não há prescrição até 12/10/2026.',
         PF, [cda('50.100.009-1', 'Imposto de Renda Pessoa Fisica', [decl('2022', '20/03/2023', '18/03/2023')])],
         esperado={}, parecer=[]),

    # ------------------------------------------------------------------ DECADÊNCIA
    caso('D01', 'Decadência pelo art. 173, I, com execução (EPE decadência)',
         'Auto de infração IRPJ: fato gerador 30/06/2016, vencimento 31/07/2016, sem pagamento, sem dolo. Marco 01/01/2017, termo 01/01/2022, notificação 22/08/2023: decaído.',
         PJ2, [cda('50.200.001-1', 'IRPJ', [ofic('2016', '30/06/2016', '31/07/2016', '22/08/2023')])],
         execucao=exec_('2000001-10.2024.4.01.3300', '10/10/2024'), esperado={DE: 'ok'}, template={DE: ED}),
    caso('D02', 'Decadência sem execução, União, com protesto (Revisão PGFN)',
         'Mesmo auto de infração; sem execução. Sai a Revisão com base legal federal, pedido de cancelamento do protesto e baixa no CADIN.',
         PJ2, [cda('50.200.002-1', 'IRPJ', [ofic('2016', '30/06/2016', '31/07/2016', '22/08/2023')], [ev('protesto', '05/05/2024')])],
         esperado={DE: 'ok'}, template={DE: RD}),
    caso('D03', 'Decadência de ICMS, credor ESTADO (Revisão sem base federal)',
         'PGE: a peça não cita Lei 10.522/2002 nem Portaria PGFN e não pede baixa no CADIN.',
         PJ2, [cda('50.200.003-1', 'ICMS', [ofic('02/2016', '28/02/2016', '09/03/2016', '10/06/2023')])],
         ente='Estado', esperado={DE: 'ok'}, template={DE: RD}),
    caso('D04', 'Art. 150, § 4º: pagamento antecipado, sem dolo',
         'Fato gerador 31/03/2016, pagamento antecipado comprovado; termo 31/03/2021; notificação 15/09/2022: decaído.',
         PJ2, [cda('50.200.004-1', 'IRPJ', [ofic('1T/2016', '31/03/2016', '29/04/2016', '15/09/2022', pagamento='sim', fonte_pagto='DARF pago em 29/04/2016')])],
         esperado={DE: 'ok'}, template={DE: RD}),
    caso('D05', 'Art. 150, § 4º com dolo "não consta": a frase sai com [CONFIRMAR]',
         'O auto de infração não diz se imputa dolo, fraude ou simulação. A peça sai, mas o advogado precisa conferir a frase destacada.',
         PJ2, [cda('50.200.005-1', 'IRPJ', [ofic('1T/2016', '31/03/2016', '29/04/2016', '15/09/2022', pagamento='sim', fonte_pagto='DARF pago em 29/04/2016', dolo='não consta')])],
         esperado={DE: 'ok'}, template={DE: RD}),
    caso('D06', 'Pagamento antecipado + dolo imputado: força o art. 173, I',
         'Multa qualificada de 150% (intuito de fraude). Mesmo com pagamento, vale o art. 173, I: marco 01/01/2017, termo 01/01/2022, notificação 15/09/2023.',
         PJ2, [cda('50.200.006-1', 'IRPJ', [ofic('1T/2016', '31/03/2016', '30/04/2016', '15/09/2023', pagamento='sim', fonte_pagto='DARF pago em 29/04/2016', dolo='sim')])],
         esperado={DE: 'ok'}, template={DE: RD}),
    caso('D07', 'Bloqueio: art. 173, I sem data de vencimento',
         'Sem vencimento não se conta pelo fato gerador: "Vencimento não identificado: necessário para contar a decadência pelo art. 173, I".',
         PJ2, [cda('50.200.007-1', 'IRPJ', [ofic('2016', '30/06/2016', None, '22/08/2023')])],
         esperado={DE: 'bloqueada'}),
    caso('D08', 'Crédito DECLARADO (DCTF): decadência não se aplica (Súmula 436)',
         'A declaração constitui o crédito. O sistema bloqueia com o aviso da Súmula 436. Datas recentes, para não haver prescrição.',
         PJ2, [cda('50.200.008-1', 'COFINS', [decl('04/2024', '25/05/2024', '24/05/2024', 'DCTF')])],
         esperado={DE: 'bloqueada'}, parecer=[DE]),
    caso('D09', 'Bloqueio: lançamento anterior anulado por vício formal (art. 173, II)',
         'Há decisão anulando o primeiro lançamento por vício formal: o prazo reabre e o caso exige análise manual.',
         PJ2, [cda('50.200.009-1', 'IRPJ', [ofic('2016', '30/06/2016', '31/07/2016', '22/08/2023', vicio='sim', anulacao='10/02/2022')])],
         esperado={DE: 'bloqueada'}),
    caso('D10', 'Decadência PARCIAL: um período decaído e outro não (pedido de retificação)',
         'Período 2016 decaído; período 2019 ainda dentro do prazo (termo 01/01/2025, notificação 22/08/2023). O pedido é de retificação, não de cancelamento integral.',
         PJ2, [cda('50.200.010-1', 'IRPJ', [ofic('2016', '30/06/2016', '31/07/2016', '22/08/2023'), ofic('2019', '30/06/2019', '31/07/2019', '22/08/2023')])],
         esperado={DE: 'ok'}, template={DE: RD}),
    caso('D11', 'Sem decadência: notificação dentro do prazo',
         'Fato gerador 30/06/2019, termo 01/01/2025; notificação em 22/08/2023. Nada decaiu.',
         PJ2, [cda('50.200.011-1', 'IRPJ', [ofic('2019', '30/06/2019', '31/07/2019', '22/08/2023')])],
         esperado={}, parecer=[]),
    caso('D12', 'Bloqueio: parcelamento antes da notificação (pode ser confissão)',
         'Parcelamento em 10/03/2018, entre o fato gerador e a notificação. O sistema bloqueia.',
         PJ2, [cda('50.200.012-1', 'IRPJ', [ofic('2016', '30/06/2016', '31/07/2016', '22/08/2023')], [ev('parcelamento', '10/03/2018')])],
         esperado={DE: 'bloqueada'}),
    caso('D13', 'Marco pelo VENCIMENTO: fato gerador 31/12/2017, vencimento 31/01/2018',
         'Marco 01/01/2019 (ano do vencimento + 1), termo 01/01/2024, notificação 15/03/2024: decaído. Contar do fato gerador daria 01/01/2023: é o caso que prova a regra.',
         PJ2, [cda('50.200.013-1', 'IRPJ', [ofic('2017', '31/12/2017', '31/01/2018', '15/03/2024')])],
         esperado={DE: 'ok'}, template={DE: RD}),
    caso('D14', 'Bloqueio: "não consta" se houve pagamento antecipado',
         'O documento não diz se houve pagamento. O sistema não presume: bloqueia.',
         PJ2, [cda('50.200.014-1', 'IRPJ', [ofic('2016', '30/06/2016', '31/07/2016', '22/08/2023', pagamento='não consta')])],
         esperado={DE: 'bloqueada'}),

    # ------------------------------------------------------------------ PRESCRIÇÃO INTERCORRENTE
    caso('I01', 'Intercorrente consumada: ciência 10/03/2017, sem eventos (EPE intercorrente)',
         'Fim da suspensão 10/03/2018; consumação 10/03/2023. Sem citação nem constrição efetiva.',
         PJ, [cda('50.300.001-1', 'IRPJ', [])],
         execucao=exec_('3000001-10.2015.4.01.3300', '15/05/2015', [ee('intimacao_nao_localizacao_bens', '10/03/2017')]),
         esperado={IN: 'ok'}, template={IN: EI}),
    caso('I02', 'Intercorrente: não localizados só os BENS',
         'Ciência 18/09/2016 sobre a não localização de bens penhoráveis. A peça diz "de bens penhoráveis".',
         PJ, [cda('50.300.002-1', 'IRPJ', [])],
         execucao=exec_('3000002-10.2015.4.01.3300', '15/05/2015', [ee('intimacao_nao_localizacao_bens', '18/09/2016', 'bens')]),
         esperado={IN: 'ok'}, template={IN: EI}),
    caso('I03', 'Penhora EFETIVA dentro do prazo: interrompe, não gera',
         'Ciência 10/03/2017 e penhora efetivada em 20/05/2020 (dentro do prazo): o ciclo é interrompido.',
         PJ, [cda('50.300.003-1', 'IRPJ', [])],
         execucao=exec_('3000003-10.2015.4.01.3300', '15/05/2015', [ee('intimacao_nao_localizacao_bens', '10/03/2017'), ee('penhora_constricao', '20/05/2020')]),
         esperado={}, parecer=[]),
    caso('I04', 'Dois ciclos: o 1º interrompido por citação, o 2º consumado',
         'Ciências em 10/03/2010 e 10/03/2017; citação em 15/05/2011 interrompeu o 1º. A peça traz o parágrafo "episódio anterior".',
         PJ, [cda('50.300.004-1', 'IRPJ', [])],
         execucao=exec_('3000004-10.2009.4.01.3300', '05/02/2009', [ee('intimacao_nao_localizacao_bens', '10/03/2010', 'devedor'), ee('citacao', '15/05/2011'), ee('intimacao_nao_localizacao_bens', '10/03/2017')]),
         esperado={IN: 'ok'}, template={IN: EI}),
    caso('I05', 'Prazo ainda em curso: ciência em 15/06/2023',
         'Fim da suspensão 15/06/2024; consumação 15/06/2029. Ainda não prescreveu.',
         PJ, [cda('50.300.005-1', 'IRPJ', [])],
         execucao=exec_('3000005-10.2022.4.01.3300', '10/01/2022', [ee('intimacao_nao_localizacao_bens', '15/06/2023')]),
         esperado={}, parecer=[]),
    caso('I06', 'Requerimento (pedido) de penhora dentro do prazo: tratamento conservador',
         'Pedido de Sisbajud em 12/08/2019, sem resultado informado. O motor atual o trata como interrupção (conservador): não gera. É o item 3 do REVISAO_JURIDICA.md.',
         PJ, [cda('50.300.006-1', 'IRPJ', [])],
         execucao=exec_('3000006-10.2015.4.01.3300', '15/05/2015', [ee('intimacao_nao_localizacao_bens', '10/03/2017'), ee('requerimento_constricao', '12/08/2019')]),
         esperado={}, parecer=[]),
    caso('I07', 'Bloqueio: duas inscrições com prescrição reconhecida em datas diferentes',
         'CDA A com ciência em 10/03/2017 e CDA B com ciência em 22/09/2018. O modelo trata um único episódio, então o sistema não escolhe por conta própria.',
         PJ, [cda('50.300.007-1', 'IRPJ', []), cda('50.300.007-2', 'CSLL', [])],
         execucao=exec_('3000007-10.2015.4.01.3300', '15/05/2015', [ee('intimacao_nao_localizacao_bens', '10/03/2017', 'devedor_e_bens', '50.300.007-1'), ee('intimacao_nao_localizacao_bens', '22/09/2018', 'devedor_e_bens', '50.300.007-2')]),
         esperado={IN: 'bloqueada'}),
    caso('I08', 'Intercorrente só para PARTE das CDAs (aviso)',
         'Só a CDA A tem ciência de não localização (10/03/2017); a CDA B não. A peça sai e avisa que cobre apenas parte das CDAs.',
         PJ, [cda('50.300.008-1', 'IRPJ', []), cda('50.300.008-2', 'CSLL', [])],
         execucao=exec_('3000008-10.2015.4.01.3300', '15/05/2015', [ee('intimacao_nao_localizacao_bens', '10/03/2017', 'devedor_e_bens', '50.300.008-1')]),
         esperado={IN: 'ok'}, template={IN: EI}),
    caso('I09', 'Citação efetiva depois da suspensão e dentro do prazo: interrompe',
         'Ciência 10/03/2017 e citação (por edital) em 15/08/2021, dentro do prazo prescricional. A citação efetiva interrompe.',
         PJ, [cda('50.300.009-1', 'IRPJ', [])],
         execucao=exec_('3000009-10.2015.4.01.3300', '15/05/2015', [ee('intimacao_nao_localizacao_bens', '10/03/2017'), ee('citacao', '15/08/2021')]),
         esperado={}, parecer=[]),

    # ------------------------------------------------------------------ COMBINADOS (mais de uma peça)
    caso('C01', 'Prescrição ordinária + intercorrente no mesmo caso (2 peças)',
         'GFIP: 3 CDAs prescritas (ajuizamento 12/03/2019) e ciência da não localização em 10/03/2020 (consumada em 10/03/2026). O modal lista as 2 peças.',
         PJ, [cda('50.400.001-1', 'Contribuicoes previdenciarias', [decl('01/2012', '20/02/2012', '15/02/2012', 'GFIP')]),
              cda('50.400.001-2', 'Contribuicoes previdenciarias', [decl('02/2012', '20/03/2012', '14/03/2012', 'GFIP')]),
              cda('50.400.001-3', 'Contribuicoes previdenciarias', [decl('13/2012', '20/12/2012', '18/01/2013', 'GFIP')])],
         execucao=exec_('4000001-10.2019.4.01.3300', '12/03/2019', [ee('intimacao_nao_localizacao_bens', '10/03/2020')]),
         esperado={PO: 'ok', IN: 'ok'}, template={PO: EP, IN: EI}),
    caso('C02', 'Decadência + intercorrente no mesmo caso (2 peças)',
         'Auto de infração decaído (art. 173, I: fato gerador de 2010, lançamento notificado em 22/08/2016) e execução com ciência de não localização em 10/03/2020 (intercorrente consumada em 10/03/2026). O modal lista a EPE de decadência e a EPE de intercorrente.',
         PJ2, [cda('50.400.002-1', 'IRPJ', [ofic('2010', '30/06/2010', '31/07/2010', '22/08/2016')])],
         execucao=exec_('4000002-10.2019.4.01.3300', '15/05/2019', [ee('intimacao_nao_localizacao_bens', '10/03/2020')]),
         esperado={DE: 'ok', IN: 'ok'}, template={DE: ED, IN: EI}),
]

for c in CENARIOS:
    c.setdefault('template', {})

if __name__ == '__main__':
    destino = os.path.join(os.path.dirname(__file__), 'cenarios.json')
    with open(destino, 'w', encoding='utf-8') as f:
        json.dump(CENARIOS, f, ensure_ascii=False, indent=1)
    print(len(CENARIOS), 'cenarios ->', destino)
