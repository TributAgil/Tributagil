"""Modelo GENÉRICO de peça (templates/pecas/Peca_generica.docx), para as peças cujo texto é montado em código
(api/_pecas-extras.js): réplica à manifestação da Fazenda, novas teses, embargos, agravo, reconhecimento de ofício.

Base: templates/pecas/EPE_prescricao_intercorrente.docx (o modelo JÁ COM CAMPOS, gerado por novos_modelos.py), para
herdar exatamente o timbre (logo do escritório e rodapé), as fontes, o título em faixa, os estilos de título de seção,
corpo e citação, o fecho e o bloco de assinatura. Do corpo só fica a ESTRUTURA:

    endereçamento            +++INS enderecamento+++
    referência do processo   +++INS referencia_processo+++
    qualificação             NOME, +++INS qualificacao_parte+++, por intermédio de ... vem, respeitosamente, +++INS verbo_peca+++
    título da peça           +++INS titulo_peca+++
    subtítulo                +++INS subtitulo_peca+++
    seções                   FOR s IN secoes: título, subtítulo (se houver), parágrafos (corpo ou citação)
    fecho e assinatura       iguais aos modelos da advogada

Cada parágrafo é uma lista de trechos ($p.trechos: [{ x: texto, n: negrito }]) para o negrito sair no Word.

Rodar a partir da raiz do repositório (depois de gerar_templates.py e novos_modelos.py):
    python scripts/templates-pecas/modelo_generico.py
"""
import copy
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from gerar_templates import *  # noqa: F401,F403

BASE = os.path.join(SAIDA, 'EPE_prescricao_intercorrente.docx')
DESTINO = os.path.join(SAIDA, 'Peca_generica.docx')

TRECHOS = (
    cmd('FOR t IN $p.trechos')
    + cmd('IF $t.n') + '**' + ins('$t.x') + '**' + cmd('END-IF')
    + cmd('IF !$t.n') + ins('$t.x') + cmd('END-IF')
    + cmd('END-FOR t')
)


def esperar(p, trecho, onde):
    exigir(trecho in texto(p), f'{onde}: esperado "{trecho}"')


def gerar():
    partes, ordem = ler_docx(BASE)
    raiz = parse(partes['word/document.xml'])
    c = filhos(raiz)

    # Conferência da base (falha alto se o modelo mudou de lugar)
    esperar(c[2], 'juizo_intercorrente', 'endereçamento')
    esperar(c[5], 'processo_numero', 'referência')
    esperar(c[7], 'executado_nome', 'qualificação')
    esperar(c[9], 'EXCEÇÃO DE PRÉ-EXECUTIVIDADE', 'título')
    esperar(c[43], 'DA PRESCRIÇÃO INTERCORRENTE', 'título de seção')
    esperar(c[45], 'A prescrição intercorrente é aquela', 'corpo')
    esperar(c[47], 'Art. 40 - O Juiz suspenderá', 'citação')
    esperar(c[93], 'Termos em que pede deferimento', 'fecho')

    titulo_secao, subtitulo, corpo_p, citacao, vazio_p = c[43], c[44], c[45], c[47], c[42]

    substituir(c[2], paragrafo_de_modelo(c[2], ins('enderecamento')))
    substituir(c[5], paragrafo_de_modelo(c[5], ins('referencia_processo')))
    substituir(
        c[7],
        paragrafo_de_modelo(
            c[7],
            '**' + ins('executado_nome') + '**, ' + ins('qualificacao_parte') + ', por intermédio de '
            + ins('tratamento_procurador') + ' que esta ' + ins('subscreve_concord') + ', ' + ins('constituido_concord')
            + ' mediante instrumento de mandato anexo (Doc. ' + ins('doc_mandato') + '), vem, respeitosamente, '
            + ins('verbo_peca'),
        ),
    )
    substituir(c[9], paragrafo_de_modelo(c[9], '**' + ins('titulo_peca') + '**'))
    substituir(c[10], paragrafo_de_modelo(c[10], ins('subtitulo_peca')))

    # Corpo: tudo entre o subtítulo e o fecho sai; entra o laço de seções
    fecho = c[93]
    novos = [
        para_cmd('FOR s IN secoes'),
        copy.deepcopy(vazio_p),
        paragrafo_de_modelo(titulo_secao, '**' + ins('$s.titulo') + '**'),
        para_cmd('IF $s.subtitulo'),
        paragrafo_de_modelo(subtitulo, '~~' + ins('$s.subtitulo') + '~~'),
        para_cmd('END-IF'),
        para_cmd('FOR p IN $s.paragrafos'),
        para_cmd('IF $p.citacao'),
        paragrafo_de_modelo(citacao, TRECHOS),
        para_cmd('END-IF'),
        para_cmd('IF !$p.citacao'),
        paragrafo_de_modelo(corpo_p, TRECHOS),
        para_cmd('END-IF'),
        para_cmd('END-FOR p'),
        para_cmd('END-FOR s'),
        copy.deepcopy(vazio_p),
    ]
    for k in range(11, 93):
        if c[k].getparent() is not None:
            remover(c[k])
    for novo in novos:
        fecho.addprevious(novo)

    partes['word/document.xml'] = serializar(raiz)
    limpar_pacote(partes)
    escrever_docx(DESTINO, partes, [n for n in ordem if n in partes])
    print('ok:', os.path.relpath(DESTINO, RAIZ))


def substituir(antigo, novo):
    antigo.addprevious(novo)
    remover(antigo)


if __name__ == '__main__':
    gerar()
