// api/_motor-prazos.js
//
// Motor de prazos DETERMINÍSTICO — matemática de datas em código, não em
// texto de prompt. Escopo deliberadamente restrito ao Módulo 4 (Prescrição
// Intercorrente, LEF art. 40 / REsp 1.340.553): é o único módulo cujo
// cálculo depende só de datas e categorias JÁ TIPADAS pela extração
// (api/_schema-extracao.js) — soma de prazos fixos (1 ano + 5 anos) e uma
// verificação de janela, sem nenhum julgamento sobre o CONTEÚDO dos
// documentos.
//
// POR QUE NÃO OS MÓDULOS 1-3 TAMBÉM: a CDCT (Módulo 1) exige classificar o
// lançamento em TIPO A/B/C — isso depende de reconhecer QUE TIPO de
// documento é cada um (DCTF vs. Auto de Infração vs. recurso administrativo
// julgado), o que a extração atual não tipa com granularidade suficiente, e
// tentar re-derivar isso aqui seria duplicar julgamento jurídico em código
// sem a mesma capacidade de leitura documental do modelo — o oposto do que
// esta mudança busca. O Módulo 4, ao contrário, comprovadamente NÃO depende
// da CDCT (ver _motor-tributagil.js: "Só se aplica se já houve ajuizamento
// ... independentemente do resultado do Módulo 3"): tem seu próprio marco
// inicial (a intimação de não localização) e é pura aritmética de data a
// partir dele.
//
// USO: api/gemini.js chama calcularPrescricaoIntercorrente() sobre a tabela
// já extraída (fase 1) e injeta o resultado no prompt da fase 2 como um
// dado JÁ CALCULADO (mesmo padrão da própria tabela de eventos) — o modelo
// não recalcula, só replica o resultado com a fundamentação jurídica ao
// redor. Depois da geração, validarConclusoesModulo4() faz uma checagem
// pós-geração (não bloqueante) comparando o que o modelo efetivamente
// escreveu contra este resultado.

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// Parse estrito de "DD/MM/AAAA" em UTC — evita deslocamento de fuso horário
// na comparação de datas (nada aqui usa hora do dia, só o dia calendário).
function parseDataBR(str) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(str || '').trim());
  if (!m) return null;
  const [, dia, mes, ano] = m;
  const data = new Date(Date.UTC(Number(ano), Number(mes) - 1, Number(dia)));
  // Rejeita datas inválidas que o Date "normaliza" silenciosamente (ex.: 31/02).
  if (data.getUTCDate() !== Number(dia) || data.getUTCMonth() !== Number(mes) - 1) return null;
  return data;
}

function formatarDataBR(data) {
  const dia = String(data.getUTCDate()).padStart(2, '0');
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const ano = data.getUTCFullYear();
  return `${dia}/${mes}/${ano}`;
}

// Soma N anos civis. Ressalva 29/fev: o rollover automático do Date (vira
// 1º/mar em ano não bissexto) é a mesma convenção adotada por calculadoras
// de prazo processual usuais — não é tratado aqui como caso especial.
function somarAnos(data, anos) {
  return new Date(Date.UTC(data.getUTCFullYear() + anos, data.getUTCMonth(), data.getUTCDate()));
}

const CATEGORIAS_INTERRUPTIVAS = ['requerimento_constricao', 'penhora_constricao', 'citacao'];

/**
 * Módulo 4 — Prescrição Intercorrente (LEF art. 40, §§1º-4º / REsp 1.340.553/RS).
 *
 * Agrupa eventos por inscrição (eventos sem inscrição específica, como
 * despacho/citação/ajuizamento, caem no grupo "(execução)"). Para cada grupo,
 * percorre a linha do tempo em ordem cronológica e monta um CICLO por
 * intimação de não localização de devedor/bens:
 *   1. Marco do ciclo = a intimação (fim da suspensão automática de 1 ano +
 *      prazo final de +5 anos a partir daí).
 *   2. Se um requerimento de constrição, constrição efetiva ou citação cair
 *      DENTRO da janela do ciclo, ele o INTERROMPE — o ciclo fica encerrado,
 *      "não configurado", e uma intimação POSTERIOR abre um ciclo novo (o
 *      processo pode ter mais de um episódio de não localização ao longo do
 *      tempo; tratar só a intimação mais antiga colapsaria episódios já
 *      resolvidos com o episódio realmente em curso hoje — corrigido após
 *      revisão externa apontar exatamente esse ponto).
 *   3. Uma intimação que cai DENTRO de um ciclo já aberto (sem interrupção
 *      entre elas) é mera reiteração do mesmo episódio — não abre ciclo novo.
 *   4. No fim, no máximo um ciclo fica em aberto (sem interrupção que o
 *      encerre) — esse é o único cujo reconhecimento depende da data atual;
 *      todos os demais (interrompidos) são sempre "não configurado".
 *
 * @param {Array<{data:string, inscricao?:string, categoria:string, fonte?:string}>} eventos
 * @param {Date} [agora]
 * @returns {Array<object>} um resultado por grupo em que ao menos um ciclo existe.
 */
export function calcularPrescricaoIntercorrente(eventos, agora = new Date()) {
  const porGrupo = new Map();
  for (const e of Array.isArray(eventos) ? eventos : []) {
    const chave = e?.inscricao || '(execução)';
    if (!porGrupo.has(chave)) porGrupo.set(chave, []);
    porGrupo.get(chave).push(e);
  }

  const resultados = [];
  for (const [inscricao, lista] of porGrupo) {
    const linha = lista
      .filter((e) => e?.categoria === 'intimacao_nao_localizacao_bens' || CATEGORIAS_INTERRUPTIVAS.includes(e?.categoria))
      .map((e) => ({ ...e, _data: parseDataBR(e.data) }))
      .filter((e) => e._data)
      .sort((a, b) => a._data - b._data || (a.categoria === 'intimacao_nao_localizacao_bens' ? -1 : 1));

    if (!linha.some((e) => e.categoria === 'intimacao_nao_localizacao_bens')) continue;

    const ciclos = [];
    let cicloAberto = null;

    for (const evento of linha) {
      if (evento.categoria === 'intimacao_nao_localizacao_bens') {
        if (!cicloAberto) {
          const fimSuspensao = somarAnos(evento._data, 1);
          cicloAberto = {
            marco: evento,
            fimSuspensao,
            prazoFinal: somarAnos(fimSuspensao, 5),
          };
        }
        continue;
      }
      // Evento interruptivo: só encerra um ciclo aberto se cair dentro da janela.
      if (cicloAberto && evento._data >= cicloAberto.marco._data && evento._data <= cicloAberto.prazoFinal) {
        ciclos.push({
          status: 'interrompido',
          marco: cicloAberto.marco,
          fimSuspensao: cicloAberto.fimSuspensao,
          prazoFinal: cicloAberto.prazoFinal,
          retroativo: evento,
        });
        cicloAberto = null;
      }
    }

    let reconhecidaAtual = false;
    let cicloAtivoInfo = null;
    if (cicloAberto) {
      const reconhecida = agora.getTime() > cicloAberto.prazoFinal.getTime();
      const diasRestantes = Math.max(0, Math.ceil((cicloAberto.prazoFinal.getTime() - agora.getTime()) / MS_POR_DIA));
      cicloAtivoInfo = {
        status: 'ativo',
        marco: cicloAberto.marco,
        fimSuspensao: cicloAberto.fimSuspensao,
        prazoFinal: cicloAberto.prazoFinal,
        reconhecida,
        diasRestantes: reconhecida ? 0 : diasRestantes,
      };
      ciclos.push(cicloAtivoInfo);
      reconhecidaAtual = reconhecida;
    }

    resultados.push({
      inscricao,
      aplicavel: true,
      reconhecidaAtual,
      ciclos: ciclos.map((c) => ({
        status: c.status,
        dataIntimacao: c.marco.data,
        fonteIntimacao: c.marco.fonte || '',
        dataFimSuspensao: formatarDataBR(c.fimSuspensao),
        dataPrazoFinal: formatarDataBR(c.prazoFinal),
        reconhecida: c.status === 'ativo' ? c.reconhecida : false,
        diasRestantes: c.status === 'ativo' ? c.diasRestantes : null,
        requerimentoRetroativo:
          c.status === 'interrompido'
            ? { data: c.retroativo.data, categoria: c.retroativo.categoria, fonte: c.retroativo.fonte || '' }
            : null,
      })),
    });
  }
  return resultados;
}

/**
 * Formata os resultados como um bloco de texto para injetar no prompt da
 * fase 2 — mesmo padrão da tabela extraída: um dado já calculado, que o
 * modelo replica com a fundamentação ao redor, em vez de recalcular.
 */
export function formatarMotorPrazosParaPrompt(resultados) {
  if (!Array.isArray(resultados) || resultados.length === 0) return '';

  const blocos = resultados.map((r) => {
    const cabecalho = `- Grupo/inscrição: ${r.inscricao} (${r.ciclos.length} ciclo(s) de não localização identificado(s))`;
    const linhasCiclos = r.ciclos.map((c, i) => {
      const base = [
        `  Ciclo ${i + 1}: intimação em ${c.dataIntimacao} (fonte: ${c.fonteIntimacao || 'não informada'}) — fim da suspensão de 1 ano: ${c.dataFimSuspensao} — prazo final (+5 anos): ${c.dataPrazoFinal}`,
      ];
      if (c.status === 'interrompido') {
        base.push(
          `    Interrompido por ${c.requerimentoRetroativo.categoria} em ${c.requerimentoRetroativo.data} (fonte: ${c.requerimentoRetroativo.fonte || 'não informada'}) — este ciclo NÃO configura prescrição intercorrente.`,
        );
      } else {
        base.push(
          `    Ciclo ATIVO hoje (nenhum requerimento/citação o encerrou): ${c.reconhecida ? 'prescrição intercorrente RECONHECIDA' : `prescrição intercorrente NÃO configurada — restam ${c.diasRestantes} dia(s)`}.`,
        );
      }
      return base.join('\n');
    });
    return [cabecalho, ...linhasCiclos].join('\n');
  });

  return `[MÓDULO 4 — PRESCRIÇÃO INTERCORRENTE: CÁLCULO JÁ FEITO DETERMINISTICAMENTE POR CÓDIGO]
Os números abaixo NÃO foram calculados por você — foram calculados por aritmética de data em código, sobre a tabela de eventos já extraída, considerando CADA episódio de não localização de devedor/bens como um ciclo próprio (uma interrupção encerra um ciclo; uma intimação posterior abre um ciclo novo). Sua tarefa é gerar um item em "conclusoes" com "tipo":"prescricao_intercorrente" PARA CADA CICLO listado abaixo (não apenas um por grupo) — "severidade":"favoravel" só para o ciclo ATIVO quando RECONHECIDA, "severidade":"desfavoravel" para todo ciclo interrompido e para o ciclo ativo quando NÃO configurada — e redigir a fundamentação jurídica ao redor deste resultado (incluindo a advertência obrigatória do Módulo 4 quando houver ciclo ativo). Não refaça a conta, e não a altere.

${blocos.join('\n\n')}`;
}

/**
 * Validação pós-geração (não bloqueante): compara o que o modelo devolveu em
 * "conclusoes" contra o resultado determinístico. Só produz strings de
 * divergência para log — nunca lança, nunca altera a resposta já enviada ao
 * navegador (ver api/gemini.js: roda sobre uma ramificação separada do
 * stream, depois que a resposta já foi encaminhada ao cliente).
 */
// LIMITE CONHECIDO: ESQUEMA_PARECER não tem um campo que ligue cada item de
// "conclusoes" a um grupo/inscrição específico (ver api/_schema-parecer.js)
// — então esta validação compara CONTAGENS de severidade esperada x
// encontrada (multiset), não item a item por grupo. Isso pega divergências
// reais (módulo não aplicado, número de ciclos errado, contagem de
// favoravel/desfavoravel errada), mas não pega o caso específico — raro,
// exige múltiplos grupos com resultados de tipos diferentes — de dois itens
// corretos na CONTAGEM global porém trocados entre os grupos errados.
// Corrigir isso por completo exigiria um campo de correlação no schema do
// parecer, fora do escopo desta validação (só log, não bloqueante).
export function validarConclusoesModulo4(resultadosMotor, conclusoes) {
  const divergencias = [];
  const aplicaveis = (resultadosMotor || []).filter((r) => r.aplicavel);
  if (aplicaveis.length === 0) return divergencias;

  const itensIntercorrente = (Array.isArray(conclusoes) ? conclusoes : []).filter(
    (c) => c?.tipo === 'prescricao_intercorrente',
  );

  const ciclosEsperados = aplicaveis.flatMap((r) => r.ciclos);
  const esperadoFavoravel = ciclosEsperados.filter((c) => c.status === 'ativo' && c.reconhecida).length;
  const esperadoDesfavoravel = ciclosEsperados.length - esperadoFavoravel;

  if (itensIntercorrente.length === 0) {
    divergencias.push(
      `Motor determinístico calculou ${ciclosEsperados.length} ciclo(s) de Módulo 4 em ${aplicaveis.length} grupo(s), mas o parecer não retornou nenhuma conclusão com tipo "prescricao_intercorrente".`,
    );
    return divergencias;
  }

  if (itensIntercorrente.length !== ciclosEsperados.length) {
    divergencias.push(
      `Motor determinístico calculou ${ciclosEsperados.length} ciclo(s) de Módulo 4, mas o parecer retornou ${itensIntercorrente.length} item(ns) "prescricao_intercorrente" — número de ciclos não bate (ex.: um episódio de não localização interrompido foi omitido, ou um ciclo foi duplicado).`,
    );
  }

  const foundFavoravel = itensIntercorrente.filter((c) => c?.severidade === 'favoravel').length;
  const foundDesfavoravel = itensIntercorrente.filter((c) => c?.severidade === 'desfavoravel').length;
  if (foundFavoravel !== esperadoFavoravel || foundDesfavoravel !== esperadoDesfavoravel) {
    divergencias.push(
      `Severidades de "prescricao_intercorrente" não batem com o motor: esperado ${esperadoFavoravel} favorável/${esperadoDesfavoravel} desfavorável, parecer trouxe ${foundFavoravel} favorável/${foundDesfavoravel} desfavorável.`,
    );
  }

  return divergencias;
}

export default { calcularPrescricaoIntercorrente, formatarMotorPrazosParaPrompt, validarConclusoesModulo4 };
