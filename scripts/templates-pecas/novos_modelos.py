"""Dois modelos novos, cujo texto jurídico veio INTEGRALMENTE do prompt da advogada
(prompt-novos-modelos.md, seções A e B) e é transcrito aqui sem alteração:

  Revisao_PGFN_decadencia        base: Revisao_PGFN_prescricao_ordinaria
  EPE_prescricao_intercorrente   base: EPE_decadencia

A formatação (fonte, recuo das citações, títulos, faixa cinza do título, tabelas, timbrado e
assinatura) é HERDADA dos parágrafos da base: cada parágrafo novo nasce de um parágrafo-modelo
(`paragrafo_de_modelo`). Blocos que o prompt manda reaproveitar ("[BLOCO COMPARTILHADO]") são os
mesmos parágrafos já existentes da base ou, quando vêm de outro modelo (conceito de decadência da
EPE para a Revisão), têm o TEXTO copiado do original e recebem a formatação da base de destino.

Notação do prompt -> docx-templates:  {{x}} = +++INS x+++ · {{#se c}}..{{/se}} = +++IF c+++..+++END-IF+++
· {{#cada l}}..{{/cada}} = +++FOR i IN l+++..+++END-FOR i+++   (sem ELSE: dois IF, o 2º negado).
Dentro de laço a variável do laço leva "$" (ex.: $p.periodo).
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from gerar_templates import *  # noqa: F401,F403  (helpers e docx_xml)


def par(modelo, markup):
    return paragrafo_de_modelo(modelo, markup)


def cmdp(texto_cmd):
    return para_cmd(texto_cmd)


def substituir(antigo, novo):
    antigo.addprevious(novo)
    remover(antigo)


def remover_intervalo(c, ini, fim):
    for k in range(ini, fim + 1):
        if c[k].getparent() is not None:
            remover(c[k])


def vazio(modelo):
    return paragrafo_de_modelo(modelo, '')


def fonte_original(nome):
    partes, _ = ler_docx(os.path.join(ORIGINAIS, nome + '.docx'))
    return filhos(parse(partes['word/document.xml']))


# ---------------------------------------------------------------------------
# A) Pedido de Revisão de Débito Fiscal — decadência
# ---------------------------------------------------------------------------

def revisao_decadencia(partes):
    raiz = parse(partes['word/document.xml'])
    c = filhos(raiz)
    epe_dec = fonte_original('EPE_decadencia')  # só o TEXTO do conceito de decadência vem daqui

    # Modelos de formatação (da própria base, Revisão PGFN)
    corpo, titulo_secao, subtitulo, citacao, legenda = c[27], c[42], c[43], c[34], c[60]
    fonte, tam = rpr_corpo(c[14])

    # ---- Endereçamento, CDA, qualificação ----
    definir_texto_paragrafo(c[1], 'AO ILUSTRÍSSIMO SENHOR PROCURADOR-CHEFE DA ' + ins('orgao_cobranca_extenso') + ' ' + ins('unidade_cobranca'))
    trocar(c[3], 'xxxxxxx', ins('cdas_lista'), 'CDA no cabeçalho')
    qualificacao_nome_e_resto(c[7], 'NOME DO DEVEDOR', 'devedor_nome', 'devedor_qualif_resto')
    aplicar_tratamento(c[7])
    trocar(c[7], '(Doc. 01)', f'(Doc. {ins("doc_mandato")})', 'doc do mandato')
    # Texto da seção A do prompt: fundamento legal da União só entra quando o credor é a União
    exigir(
        trocar_entre(
            c[7], ', vem,', 'apresentar o presente',
            ', vem, respeitosamente, a Vossa Senhoria, tendo em vista o regramento contido no artigo 5º, XXXIV, da Constituição Federal'
            + cmd('IF ente_uniao')
            + ', nos artigos 20-B e 20-C da Lei nº 10.522/2002 e nos artigos 15 a 20 da Portaria PGFN nº 33/2018'
            + cmd('END-IF')
            + ', e no artigo 205 do CTN, apresentar o presente',
        ),
        'fundamento legal da qualificação',
    )

    # ---- Preliminarmente / quadro sinóptico (novo; entra antes de DOS FATOS) ----
    quadro = construir_tabela(
        ['Tese', 'Fundamento'], [3200, 5800], None,
        fonte=fonte, tamanho=tam,
        linhas_estaticas=[
            ['Decadência do direito de constituir o crédito tributário',
             '**Art. 150, § 4º, e art. 173, I, do CTN; art. 156, V, do CTN; Súmula 555/STJ; REsp 973.733/SC (Tema 163/STJ)**'],
            ['Lançamento notificado após o transcurso do prazo decadencial', 'Extinção do crédito e nulidade da inscrição em dívida ativa'],
            ['Dever de autotutela da Administração', '**Súmula 473/STF**; matéria de ordem pública, reconhecível de ofício'],
        ],
    )
    for el in [
        par(titulo_secao, '**PRELIMINARMENTE**'),
        par(subtitulo, '~~Quadro sinóptico~~'),
        par(corpo, 'Com o escopo de conferir celeridade à análise administrativa e evidenciar a patente causa extintiva do crédito tributário inscrito, sintetizam-se as teses basilares que fundamentam este pleito no quadro sinóptico a seguir:'),
        quadro,
        vazio(corpo),
    ]:
        c[13].addprevious(el)

    # ---- Dos fatos ----
    substituir(c[14], par(corpo,
        'Trata-se de débito tributário inscrito em dívida ativa em desfavor de ' + ins('devedor_nome')
        + ', materializado na Certidão de Dívida Ativa (CDA) nº ' + ins('cdas_lista')
        + ', originário de ' + ins('origem_lancamento_extenso') + ' relativo a ' + ins('tributo')
        + ', período(s) de apuração ' + ins('periodos_lista') + '.'))
    substituir(c[15], par(corpo,
        'Em que pese a natureza e os fundamentos jurídicos que justificaram a cobrança do aludido valor, observa-se que o referido crédito restou fulminado pela **DECADÊNCIA** — perda do direito do Fisco de constituir o crédito tributário pelo lançamento —, uma vez que o lançamento somente foi notificado ao contribuinte após o transcurso do prazo quinquenal previsto no Código Tributário Nacional, pelo que se impõe o cancelamento da inscrição e a extinção do crédito, **nos termos do art. 156, V, c/c arts. 150, § 4º, e 173, I, todos do CTN.**'))
    remover_intervalo(c, 18, 21)  # espaçamento do modelo anterior

    # ---- Do cabimento: c[24]..c[34] (até a Súmula 473/STF) é o BLOCO COMPARTILHADO, mantido idêntico ----
    for el in [
        cmdp('IF ente_uniao'),
        par(corpo, 'No âmbito da Procuradoria-Geral da Fazenda Nacional, o pedido de revisão de dívida inscrita encontra disciplina específica nos artigos 20-B e 20-C da Lei nº 10.522/2002 e nos artigos 15 a 20 da Portaria PGFN nº 33/2018, que admitem expressamente a alegação de **decadência** como fundamento para o cancelamento da inscrição.'),
        cmdp('END-IF'),
        par(corpo, 'Ressalte-se, ademais, que a decadência é causa extintiva do próprio crédito tributário (art. 156, V, do CTN) e constitui matéria de ordem pública, cujo reconhecimento independe de provocação, devendo a Administração Tributária declará-la de ofício tão logo constatada.'),
    ]:
        c[36].addprevious(el)
    substituir(c[36], par(corpo, 'Ultrapassadas estas digressões preliminares, passa-se à análise da decadência.'))
    remover_intervalo(c, 38, 41)

    tail_173 = (
        ', razão pela qual o prazo decadencial rege-se pelo **art. 173, I, do CTN** e pela **Súmula 555/STJ**, iniciando-se em **'
        + ins('$p.marco_inicial')
        + '**, primeiro dia do exercício seguinte àquele em que o lançamento poderia ter sido efetuado'
    )
    novos = []

    # ---- Da decadência (conceito): texto do bloco compartilhado da EPE de decadência, formatação desta base ----
    novos += [
        par(titulo_secao, '**DA DECADÊNCIA DO DIREITO DE CONSTITUIR O CRÉDITO TRIBUTÁRIO**'),
        par(subtitulo, '~~Perda do direito de constituir o crédito pelo lançamento. Extinção do crédito tributário.~~'),
    ]
    corpo_idx = {44, 45, 51}
    for k in (44, 45, 47, 48, 49, 50, 51, 52):
        modelo = corpo if k in corpo_idx else citacao
        novos.append(par(modelo, markup_de_paragrafo(epe_dec[k])))
        if k == 50:
            pass
    novos += [
        vazio(corpo),
        par(corpo, 'No mesmo sentido, ao julgar o Recurso Especial Repetitivo nº 973.733/SC (Tema 163), a Primeira Seção do Superior Tribunal de Justiça consolidou que o prazo decadencial quinquenal conta-se do primeiro dia do exercício seguinte àquele em que o lançamento poderia ter sido efetuado (art. 173, I, do CTN) nos casos em que a lei não prevê o pagamento antecipado da exação ou quando, a despeito da previsão legal, ele não ocorre, sem a constatação de dolo, fraude ou simulação do contribuinte, sendo **injustificada a aplicação cumulativa dos prazos dos arts. 150, § 4º, e 173 do CTN.**'),
        par(corpo, 'Destaca-se, ainda, que o prazo decadencial, diferentemente do prescricional, não se sujeita a interrupção ou suspensão, de modo que nenhum ato posterior da Administração tem o condão de reabrir o prazo já esgotado.'),
        par(corpo, 'Sendo assim, passa-se a demonstrar a inequívoca ocorrência da decadência no caso em apreço.'),
        vazio(corpo),
    ]

    # ---- Da decadência do crédito inscrito (um bloco por CDA) ----
    novos += [
        cmdp('FOR cda IN cdas'),
        par(titulo_secao, '**DA DECADÊNCIA DO CRÉDITO INSCRITO NA CDA nº ' + ins('$cda.numero') + '**'),
        par(subtitulo, '~~Impõe-se o cancelamento da inscrição.~~'),
        par(corpo, 'Inicialmente, registra-se que o crédito constante da CDA nº ' + ins('$cda.numero') + ' teve origem em ' + ins('$cda.origem') + ', referente ao(s) período(s) de apuração ' + ins('$cda.periodos_lista') + '.'),
        cmdp('FOR p IN $cda.periodos_decaidos'),
        par(corpo,
            'Quanto ao período de apuração **' + ins('$p.periodo') + '**, o fato gerador ocorreu em **' + ins('$p.data_fato_gerador') + '**, '
            + cmd('IF $p.regra_150_4')
            + 'tendo o contribuinte realizado o pagamento antecipado da exação, conforme ' + ins('$p.fonte_pagamento')
            + ', razão pela qual o prazo decadencial rege-se pelo **art. 150, § 4º, do CTN**, iniciando-se na data do próprio fato gerador'
            + cmd('END-IF')
            # o docx-templates não aceita IF aninhado na mesma linha: o "se dolo" vira um IF irmão
            + cmd('IF $p.regra_173_I && !$p.dolo_fraude_imputado')
            + 'não tendo havido pagamento antecipado da exação' + tail_173
            + cmd('END-IF')
            + cmd('IF $p.regra_173_I && $p.dolo_fraude_imputado')
            + 'não tendo havido pagamento antecipado da exação'
            + ' — ou tendo sido imputada ao contribuinte a prática de dolo, fraude ou simulação —' + tail_173
            + cmd('END-IF')
            + '. Assim, o direito de a Fazenda Pública constituir o crédito extinguiu-se em **' + ins('$p.termo_final') + '**.'),
        par(corpo, 'Ocorre que o lançamento somente foi notificado ao contribuinte em **' + ins('$p.data_notificacao_lancamento') + '**, conforme ' + ins('$p.fonte_notificacao') + ', ou seja, **quando já consumada a decadência.**'),
        cmdp('END-FOR p'),
        # Registro sobre dolo: confirmado no lançamento vs. a confirmar pelo advogado (frase destacada em amarelo)
        cmdp('IF $cda.algum_150_confirmado'),
        par(corpo, 'Registre-se que não consta do lançamento qualquer imputação de dolo, fraude ou simulação ao contribuinte que pudesse deslocar o marco inicial para a regra do art. 173, I, do CTN.'),
        cmdp('END-IF'),
        cmdp('IF $cda.algum_150_confirmar'),
        par(corpo, '[CONFIRMAR: Registre-se que não consta do lançamento qualquer imputação de dolo, fraude ou simulação ao contribuinte que pudesse deslocar o marco inicial para a regra do art. 173, I, do CTN.]'),
        cmdp('END-IF'),
        cmdp('END-FOR cda'),
        par(corpo, ins('fig_notificacao')),
        par(legenda, '**~~' + ins('fig_notificacao_legenda') + '~~**'),
        vazio(corpo),
        par(corpo, 'Para fins de ilustração, a tabela abaixo sintetiza os marcos de cada período:'),
        construir_tabela(
            ['Período', 'Fato gerador', 'Regra aplicável', 'Marco inicial', 'Termo final', 'Notificação do lançamento', 'Situação'],
            [1000, 1250, 1350, 1250, 1250, 1500, 1400],
            [ins('$t.periodo'), ins('$t.data_fato_gerador'), ins('$t.regra_aplicavel'), ins('$t.marco_inicial'), ins('$t.termo_final'), ins('$t.data_notificacao_lancamento'), '**' + ins('$t.situacao') + '**'],
            loop=('t', 'periodos_tabela'), fonte=fonte, tamanho=17,
        ),
        vazio(corpo),
        par(corpo, 'Para fins de ilustração, a linha do tempo abaixo demonstra o curso do crédito tributário discutido e a ocorrência da decadência:'),
        construir_tabela(['Data', 'Evento', 'Documento-fonte'], [1500, 4500, 3000], [ins('$m.data'), ins('$m.evento'), ins('$m.fonte')], loop=('m', 'linha_do_tempo'), fonte=fonte, tamanho=tam),
        vazio(corpo),
        par(corpo, 'Diante do exposto, sendo o lançamento posterior ao termo final do prazo decadencial, o crédito tributário inscrito encontra-se **extinto** (art. 156, V, do CTN), de modo que a manutenção da inscrição em dívida ativa — e de todos os seus efeitos, como protesto, inscrição em cadastros restritivos e óbice à emissão de certidão de regularidade fiscal — afronta o princípio da legalidade e impõe à Administração o dever de anular o próprio ato, nos termos da Súmula 473 do STF.'),
        vazio(corpo),
    ]
    for el in novos:
        c[110].addprevious(el)
    remover_intervalo(c, 42, 109)

    # ---- Dos pedidos (as letras são renumeradas em sequência conforme os condicionais ativos) ----
    pedidos = [
        par(corpo, 'Pelas razões expostas, requer:'),
        par(corpo, 'a) o reconhecimento da **decadência** do direito de constituir o crédito tributário relativo ao(s) período(s) de apuração ' + ins('periodos_decaidos_lista') + ', com a consequente extinção do crédito, nos termos do art. 156, V, do CTN;'),
        par(corpo,
            'b) ' + cmd('IF decadencia_total') + 'o **cancelamento integral** da inscrição em dívida ativa nº ' + ins('cdas_lista') + cmd('END-IF')
            + cmd('IF decadencia_parcial') + 'a **retificação** da inscrição em dívida ativa nº ' + ins('cdas_lista') + ', com a exclusão dos valores relativos aos períodos alcançados pela decadência' + cmd('END-IF') + ';'),
        cmdp('IF houve_protesto'),
        par(corpo, ins('letra_protesto') + ') o cancelamento do protesto da CDA nº ' + ins('cdas_protestadas_lista') + ', sem a cobrança de quaisquer emolumentos ao devedor;'),
        cmdp('END-IF'),
        cmdp('IF ente_uniao'),
        par(corpo, ins('letra_cadin') + ') a baixa de eventuais registros no CADIN decorrentes da inscrição ora impugnada;'),
        cmdp('END-IF'),
        par(corpo, ins('letra_certidao') + ') a emissão de **Certidão Negativa de Débitos** que ateste a regularidade fiscal do devedor perante o Fisco.'),
    ]
    for el in pedidos:
        c[111].addprevious(el)
    remover(c[111])

    definir_texto_paragrafo(c[114], ins('fecho_local_data'))
    assinatura(c, 119, 121, 118, 117)
    partes['word/document.xml'] = serializar(raiz)


# ---------------------------------------------------------------------------
# B) Exceção de Pré-Executividade — prescrição intercorrente
# ---------------------------------------------------------------------------

def epe_intercorrente(partes):
    raiz = parse(partes['word/document.xml'])
    c = filhos(raiz)
    corpo, titulo_secao, subtitulo, citacao, legenda = c[27], c[41], c[42], c[30], c[27]
    fonte, tam = rpr_corpo(c[20])
    tam = 22

    # ---- Cabeçalho da peça ----
    definir_texto_paragrafo(c[2], ins('juizo_intercorrente'))
    trocar(c[5], 'Processo', 'Execução Fiscal', 'rótulo do processo')
    trocar(c[5], 'xxxxxx', ins('processo_numero'), 'nº da execução')
    substituir(c[7], par(c[7],
        '**' + ins('executado_nome') + '**, já devidamente qualificado(a) nos autos em epígrafe, por intermédio de ' + ins('tratamento_procurador')
        + ' que esta ' + ins('subscreve_concord') + ', ' + ins('constituido_concord') + ' mediante instrumento de mandato anexo (Doc. ' + ins('doc_mandato')
        + '), vem, respeitosamente, a Vossa Excelência, opor a presente '))

    # ---- Quadro sinóptico (4 linhas de texto jurídico fixo) ----
    quadro = construir_tabela(
        ['Tese', 'Fundamento'], [3200, 5800], None, fonte=fonte, tamanho=tam,
        linhas_estaticas=[
            ['Prescrição intercorrente consumada', '**Art. 40, §§ 1º a 4º, da Lei nº 6.830/1980; art. 156, V, do CTN; Súmula 314/STJ**'],
            ['Início automático dos prazos, independentemente de decisão judicial', '**REsp 1.340.553/RS (Temas 566 a 571/STJ); RE 636.562/SC (Tema 390/STF)**'],
            ['Ausência de citação e de constrição patrimonial efetiva no período', '**REsp 1.340.553/RS**'],
            ['Matéria de ordem pública, cognoscível de ofício', '**Art. 40, § 4º, da LEF; art. 803, parágrafo único, do CPC; Súmula 393/STJ**'],
        ],
    )
    c[16].addprevious(quadro)
    remover(c[16])

    # ---- Dos fatos ----
    substituir(c[20], par(c[20],
        'Trata-se de execução fiscal ajuizada em **' + ins('data_ajuizamento') + '** pela ' + ins('exequente') + ' em desfavor de ' + ins('executado_nome')
        + ', para cobrança do crédito tributário materializado na(s) Certidão(ões) de Dívida Ativa nº ' + ins('cdas_lista') + '.'))
    substituir(c[21], par(c[20],
        'No curso do processo, a Fazenda Pública tomou ciência, em **' + ins('data_intimacao') + '**, da não localização ' + ins('objeto_nao_localizado')
        + ', conforme ' + ins('fonte_intimacao') + '. A partir de então, transcorreu o prazo de 1 (um) ano de suspensão do processo, encerrado em **' + ins('data_fim_suspensao')
        + '**, iniciando-se automaticamente o prazo prescricional quinquenal, que se consumou em **' + ins('data_prazo_final')
        + '**, sem que houvesse, nesse interregno, citação ou constrição patrimonial efetiva apta a interrompê-lo.'))
    # c[22] 'É o que se passa a demonstrar.' fica; antes dele entra o parágrafo da conclusão
    c[22].addprevious(par(c[20], 'Impõe-se, assim, o reconhecimento da prescrição intercorrente e a extinção da execução, **nos termos do art. 40, § 4º, da Lei nº 6.830/1980 e do art. 156, V, do CTN.**'))

    # ---- Do cabimento: c[24]..c[39] é o BLOCO COMPARTILHADO. Só o fecho do último parágrafo muda (decadência -> prescrição) ----
    trocar(c[39], 'fulminada pela decadência', 'fulminada pela prescrição', 'fecho do cabimento')
    c[39].addnext(par(c[27], 'Ressalte-se que, no caso da prescrição intercorrente, a própria Lei de Execuções Fiscais autoriza o seu reconhecimento de ofício pelo magistrado (art. 40, § 4º), o que reforça tratar-se de matéria de ordem pública, aferível de plano pela simples análise da movimentação processual.'))

    novos = [
        vazio(corpo),
        par(titulo_secao, '**DA PRESCRIÇÃO INTERCORRENTE**'),
        par(subtitulo, '~~Perda da pretensão executória pela inércia do exequente. Extinção do crédito tributário.~~'),
        par(corpo, 'A prescrição intercorrente é aquela que se consuma no curso do próprio processo executivo quando, após a suspensão da execução pela não localização do devedor ou de bens penhoráveis, o exequente permanece sem promover atos efetivos de satisfação do crédito pelo prazo prescricional.'),
        par(corpo, 'Sua disciplina, no âmbito das execuções fiscais, encontra-se no art. 40 da Lei nº 6.830/1980:'),
        par(citacao, 'Art. 40 - O Juiz suspenderá o curso da execução, enquanto não for localizado o devedor ou encontrados bens sobre os quais possa recair a penhora, e, nesses casos, não correrá o prazo de prescrição.'),
        par(citacao, '§ 1º - Suspenso o curso da execução, será aberta vista dos autos ao representante judicial da Fazenda Pública.'),
        par(citacao, '§ 2º - Decorrido o prazo máximo de 1 (um) ano, sem que seja localizado o devedor ou encontrados bens penhoráveis, o Juiz ordenará o arquivamento dos autos.'),
        par(citacao, '§ 3º - Encontrados que sejam, a qualquer tempo, o devedor ou os bens, serão desarquivados os autos para prosseguimento da execução.'),
        par(citacao, '**§ 4º Se da decisão que ordenar o arquivamento tiver decorrido o prazo prescricional, o juiz, depois de ouvida a Fazenda Pública, poderá, de ofício, reconhecer a prescrição intercorrente e decretá-la de imediato.**'),
        vazio(corpo),
        par(corpo, 'O Superior Tribunal de Justiça sedimentou a matéria na Súmula 314:'),
        par(citacao, '**Súmula 314 - Em execução fiscal, não localizados bens penhoráveis, suspende-se o processo por um ano, findo o qual se inicia o prazo da prescrição quinquenal intercorrente.**'),
        vazio(corpo),
        par(corpo, 'Posteriormente, no julgamento do Recurso Especial Repetitivo nº 1.340.553/RS (Temas 566 a 571), a Primeira Seção do STJ fixou as balizas de aplicação do art. 40 da LEF, das quais se destacam:'),
        par(corpo, '(i) **o prazo de 1 (um) ano de suspensão inicia-se automaticamente na data da ciência da Fazenda Pública a respeito da não localização do devedor ou de bens penhoráveis;**'),
        par(corpo, '(ii) havendo ou não petição da Fazenda Pública e havendo ou não pronunciamento judicial nesse sentido, **findo o prazo de 1 (um) ano de suspensão inicia-se automaticamente o prazo prescricional aplicável**, durante o qual o processo deveria estar arquivado sem baixa na distribuição, findo o qual estará consumada a prescrição intercorrente; e'),
        par(corpo, '(iii) **somente a efetiva constrição patrimonial e a efetiva citação (ainda que por edital) são aptas a interromper o curso da prescrição intercorrente**, não bastando para tal o mero peticionamento em juízo requerendo a feitura da penhora sobre ativos financeiros ou sobre outros bens.'),
        par(corpo, 'O Supremo Tribunal Federal, por sua vez, no julgamento do RE 636.562/SC (Tema 390 da Repercussão Geral), confirmou a constitucionalidade do dispositivo, fixando a seguinte tese:'),
        par(citacao, '**Tema 390/STF - É constitucional o art. 40 da Lei nº 6.830/1980 (Lei de Execuções Fiscais – LEF), tendo natureza processual o prazo de 1 (um) ano de suspensão da execução fiscal. Após o decurso desse prazo, inicia-se automaticamente a contagem do prazo prescricional tributário de 5 (cinco) anos.**'),
        vazio(corpo),
        par(corpo, 'Em síntese: a contagem independe de decisão judicial de suspensão ou de arquivamento, e o prazo total é de **6 (seis) anos** contados da ciência da Fazenda Pública acerca da não localização do devedor ou de bens: 1 (um) ano de suspensão somado a 5 (cinco) anos de prescrição.'),
        vazio(corpo),
        par(titulo_secao, '**DA PRESCRIÇÃO INTERCORRENTE NO CASO CONCRETO**'),
        par(subtitulo, '~~Impõe-se a extinção da execução.~~'),
        par(corpo,
            'Na hipótese dos autos, a Fazenda Pública tomou ciência da não localização ' + ins('objeto_nao_localizado') + ' em **' + ins('data_intimacao') + '**, conforme ' + ins('fonte_intimacao')
            + '. Nesse momento, nos termos do item (i) acima, iniciou-se automaticamente o prazo de 1 (um) ano de suspensão, encerrado em **' + ins('data_fim_suspensao')
            + '**. Ato contínuo, iniciou-se o prazo prescricional de 5 (cinco) anos, **que se consumou em ' + ins('data_prazo_final') + '.**'),
        par(corpo, ins('fig_intimacao')),
        par(corpo, '**~~' + ins('fig_intimacao_legenda') + '~~**'),
        construir_tabela(
            ['Marco', 'Data', 'Fundamento'], [3300, 1500, 4200], None, fonte=fonte, tamanho=tam,
            linhas_estaticas=[
                ['Ciência da Fazenda sobre a não localização', ins('data_intimacao'), '**Art. 40, caput e § 1º, LEF; REsp 1.340.553/RS**'],
                ['Fim da suspensão de 1 ano / início do prazo prescricional', ins('data_fim_suspensao'), '**Art. 40, § 2º, LEF; Súmula 314/STJ; Tema 390/STF**'],
                ['Consumação da prescrição intercorrente', ins('data_prazo_final'), '**Art. 40, § 4º, LEF; art. 174 do CTN**'],
                ['Data da presente petição', ins('data_hoje'), 'Prazo extrapolado: **operada a prescrição intercorrente**'],
            ],
        ),
        vazio(corpo),
        par(corpo, 'Entre ' + ins('data_intimacao') + ' e ' + ins('data_prazo_final') + ' não houve citação do executado nem qualquer constrição patrimonial efetiva, que são os únicos eventos aptos a interromper a prescrição intercorrente segundo o item (iii) do REsp 1.340.553/RS, consoante se verifica da movimentação processual anexa.'),
        cmdp('IF ha_ciclos_interrompidos'),
        cmdp('FOR ci IN ciclos_interrompidos'),
        par(corpo, 'Registre-se, por oportuno, que episódio anterior de não localização, com ciência da Fazenda em ' + ins('$ci.data_intimacao_ciclo') + ', teve a contagem interrompida em ' + ins('$ci.data_interrupcao') + ' por ' + ins('$ci.evento_interrupcao_extenso') + '. A contagem ora demonstrada refere-se ao episódio subsequente, iniciado em ' + ins('data_intimacao') + ', que não sofreu qualquer interrupção.'),
        cmdp('END-FOR ci'),
        cmdp('END-IF'),
        par(corpo, 'Para fins de ilustração, a linha do tempo abaixo demonstra o curso da execução e a ocorrência da prescrição intercorrente:'),
        construir_tabela(['Data', 'Evento', 'Documento-fonte'], [1500, 4500, 3000], [ins('$m.data'), ins('$m.evento'), ins('$m.fonte')], loop=('m', 'linha_do_tempo'), fonte=fonte, tamanho=tam),
        vazio(corpo),
        par(corpo, 'Diante do exposto, consumada a prescrição intercorrente, o crédito tributário exequendo encontra-se **extinto** (art. 156, V, do CTN), não subsistindo pretensão executória apta a justificar o prosseguimento do feito.'),
        par(corpo, 'É imperioso reconhecer a prescrição intercorrente, não apenas pelo direito do Executado, mas também para evitar que a inércia da Fazenda Pública perpetue execuções fiscais inviáveis, sobrecarregando o acervo processual do Judiciário em detrimento da efetividade da Justiça e do postulado da razoável duração do processo.'),
        vazio(corpo),
    ]
    for el in novos:
        c[78].addprevious(el)
    remover_intervalo(c, 40, 77)  # restante da EPE de decadência (conteúdo antigo)

    # ---- Dos pedidos (SEM honorários de sucumbência: Tema 1.229/STJ — ver REVISAO_JURIDICA.md) ----
    pedidos = [
        par(corpo, 'Isto posto, requer a V.Exa.:'),
        par(corpo, 'a) o recebimento da presente exceção de pré-executividade, com o sobrestamento dos atos executivos enquanto não apreciada a presente postulação;'),
        par(corpo, 'b) a intimação da Fazenda Pública para, querendo, manifestar-se, nos termos do art. 40, § 4º, da Lei nº 6.830/1980;'),
        par(corpo, 'c) o **reconhecimento da prescrição intercorrente** do crédito tributário consubstanciado na(s) CDA(s) nº ' + ins('cdas_lista') + ', com a consequente **extinção da execução fiscal**, nos termos do art. 40, § 4º, da Lei nº 6.830/1980, do art. 156, V, do CTN e do art. 924, V, do CPC;'),
        cmdp('IF houve_protesto'),
        par(corpo, ins('letra_protesto') + ') o cancelamento do(s) protesto(s) da(s) CDA(s) nº ' + ins('cdas_protestadas_lista') + ', sem a cobrança de quaisquer emolumentos ao executado;'),
        cmdp('END-IF'),
        par(corpo, ins('letra_liberacao') + ') a liberação de eventuais restrições e constrições existentes nos autos.'),
    ]
    for el in pedidos:
        c[79].addprevious(el)
    remover(c[79])

    definir_texto_paragrafo(c[81], ins('fecho_local_data'))
    assinatura(c, 86, 91, 84, 83)
    partes['word/document.xml'] = serializar(raiz)
