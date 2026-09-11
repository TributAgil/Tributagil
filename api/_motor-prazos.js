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

/**
 * Módulo 4 — Prescrição Intercorrente (LEF art. 40, §§1º-4º / REsp 1.340.553/RS).
 *
 * Agrupa eventos por inscrição (eventos sem inscrição específica, como
 * despacho/citação/ajuizamento, caem no grupo "(execução)"). Para cada grupo
 * com pelo menos um evento "intimacao_nao_localizacao_bens":
 *   1. Marco = a intimação MAIS ANTIGA do grupo (suspensões subsequentes do
 *      mesmo tipo não reiniciam prazo já em curso).
 *   2. Fim da suspensão automática = marco + 1 ano (art. 40, §2º).
 *   3. Prazo final = fim da suspensão + 5 anos.
 *   4. Requerimento retroativo: qualquer "requerimento_constricao",
 *      "penhora_constricao" ou "citacao" datado DENTRO da janela [marco,
 *      prazo final] barra o reconhecimento, mesmo que o resultado do pedido
 *      só tenha sido juntado aos autos depois (item 3 do Módulo 4 no motor).
 *
 * @param {Array<{data:string, inscricao?:string, categoria:string, fonte?:string}>} eventos
 * @param {Date} [agora]
 * @returns {Array<object>} um resultado por grupo em que o módulo se aplica.
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
    const intimacoes = lista
      .filter((e) => e?.categoria === 'intimacao_nao_localizacao_bens')
      .map((e) => ({ ...e, _data: parseDataBR(e.data) }))
      .filter((e) => e._data)
      .sort((a, b) => a._data - b._data);

    if (intimacoes.length === 0) continue;

    const marco = intimacoes[0];
    const fimSuspensao = somarAnos(marco._data, 1);
    const prazoFinal = somarAnos(fimSuspensao, 5);

    const requerimentos = lista
      .filter((e) => ['requerimento_constricao', 'penhora_constricao', 'citacao'].includes(e?.categoria))
      .map((e) => ({ ...e, _data: parseDataBR(e.data) }))
      .filter((e) => e._data && e._data >= marco._data && e._data <= prazoFinal)
      .sort((a, b) => a._data - b._data);

    const retroativo = requerimentos[0] || null;
    const reconhecida = agora.getTime() > prazoFinal.getTime() && !retroativo;
    const diasRestantes = Math.max(0, Math.ceil((prazoFinal.getTime() - agora.getTime()) / MS_POR_DIA));

    resultados.push({
      inscricao,
      aplicavel: true,
      dataIntimacao: marco.data,
      fonteIntimacao: marco.fonte || '',
      dataFimSuspensao: formatarDataBR(fimSuspensao),
      dataPrazoFinal: formatarDataBR(prazoFinal),
      reconhecida,
      diasRestantes: reconhecida ? 0 : diasRestantes,
      requerimentoRetroativo: retroativo
        ? { data: retroativo.data, categoria: retroativo.categoria, fonte: retroativo.fonte || '' }
        : null,
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
    const linhas = [
      `- Grupo/inscrição: ${r.inscricao}`,
      `  Intimação da Fazenda sobre não localização de devedor/bens: ${r.dataIntimacao} (fonte: ${r.fonteIntimacao || 'não informada'})`,
      `  Fim da suspensão automática de 1 ano (art. 40, §2º, LEF): ${r.dataFimSuspensao}`,
      `  Prazo final da prescrição intercorrente (+5 anos): ${r.dataPrazoFinal}`,
      r.requerimentoRetroativo
        ? `  Requerimento/citação dentro da janela, com efeito retroativo: ${r.requerimentoRetroativo.data} (${r.requerimentoRetroativo.categoria}, fonte: ${r.requerimentoRetroativo.fonte || 'não informada'}) — a prescrição intercorrente NÃO se consumou.`
        : `  Nenhum requerimento de constrição ou citação localizado dentro da janela.`,
      `  RESULTADO JÁ CALCULADO (não recalcule): ${r.reconhecida ? 'prescrição intercorrente RECONHECIDA' : `prescrição intercorrente NÃO configurada — restam ${r.diasRestantes} dia(s)`}.`,
    ];
    return linhas.join('\n');
  });

  return `[MÓDULO 4 — PRESCRIÇÃO INTERCORRENTE: CÁLCULO JÁ FEITO DETERMINISTICAMENTE POR CÓDIGO]
Os números abaixo NÃO foram calculados por você — foram calculados por aritmética de data em código, sobre a tabela de eventos já extraída. Sua tarefa é usar EXATAMENTE estas datas e este resultado no item de "conclusoes" com "tipo":"prescricao_intercorrente" (um item por grupo abaixo), com "severidade":"favoravel" quando RECONHECIDA e "severidade":"desfavoravel" quando NÃO configurada — e redigir a fundamentação jurídica (premissa, aplicação, referência) ao redor deste resultado, incluindo a advertência obrigatória do Módulo 4. Não refaça a conta, e não a altere.

${blocos.join('\n\n')}`;
}

/**
 * Validação pós-geração (não bloqueante): compara o que o modelo devolveu em
 * "conclusoes" contra o resultado determinístico. Só produz strings de
 * divergência para log — nunca lança, nunca altera a resposta já enviada ao
 * navegador (ver api/gemini.js: roda sobre uma ramificação separada do
 * stream, depois que a resposta já foi encaminhada ao cliente).
 */
export function validarConclusoesModulo4(resultadosMotor, conclusoes) {
  const divergencias = [];
  const aplicaveis = (resultadosMotor || []).filter((r) => r.aplicavel);
  if (aplicaveis.length === 0) return divergencias;

  const itensIntercorrente = (Array.isArray(conclusoes) ? conclusoes : []).filter(
    (c) => c?.tipo === 'prescricao_intercorrente',
  );

  if (itensIntercorrente.length === 0) {
    divergencias.push(
      `Motor determinístico aplicável a ${aplicaveis.length} grupo(s) (Módulo 4), mas o parecer não retornou nenhuma conclusão com tipo "prescricao_intercorrente".`,
    );
    return divergencias;
  }

  for (const r of aplicaveis) {
    const esperada = r.reconhecida ? 'favoravel' : 'desfavoravel';
    const bateu = itensIntercorrente.some((c) => c?.severidade === esperada);
    if (!bateu) {
      divergencias.push(
        `Grupo "${r.inscricao}": motor calculou severidade "${esperada}" (prazo final ${r.dataPrazoFinal}${r.requerimentoRetroativo ? `, requerimento retroativo em ${r.requerimentoRetroativo.data}` : ''}), mas nenhum item "prescricao_intercorrente" do parecer usou essa severidade.`,
      );
    }
  }
  return divergencias;
}

export default { calcularPrescricaoIntercorrente, formatarMotorPrazosParaPrompt, validarConclusoesModulo4 };
