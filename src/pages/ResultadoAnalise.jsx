// src/pages/ResultadoAnalise.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  FileText,
  Download,
  FileType2,
  Scale,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown,
  Shield,
  BookOpen,
  Gavel,
  ArrowLeft,
  Printer,
  Copy,
  Check,
  Brain,
  Calendar,
  Hash,
  Pencil,
  Loader2,
  FilePlus2,
  History,
} from 'lucide-react';
import RodapeLegal from '../components/RodapeLegal';
import ChatLuFlutuante from '../components/ChatLuFlutuante';
import Logo from '../components/Logo';
import { salvarObservacoes } from '../lib/analises';
import { useRevelar } from '../hooks/useRevelar';

// Ordena a linha do tempo por data crescente. Usada na tela E nas duas
// exportações (Word e .txt) — a promessa de "timeline cronológica" vale em
// todo lugar onde a lista aparece, não só na aba.
// Data ausente ou fora do formato DD/MM/AAAA vai para o fim, em vez de sumir
// ou embaralhar o resto.
function ordenarFatosPorData(fatos) {
  const ordinal = (br) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(br || '').trim());
    if (!m) return Number.POSITIVE_INFINITY;
    const [, dia, mes, ano] = m;
    return Number(`${ano}${mes}${dia}`); // AAAAMMDD compara como número
  };
  return [...(fatos ?? [])].sort((a, b) => ordinal(a?.data) - ordinal(b?.data));
}


// ============================================
// DADOS MOCK DE SEGURANÇA (FALLBACK)
// ============================================
const RESULTADO_MOCK = {
  metadata: {
    id_analise: '—',
    data_analise: '26/08/2026',
    processo: '1002345-78.2024.8.26.0100',
    parte_autora: 'Fazenda Nacional',
    parte_reu: 'Indústria Alpha Ltda.',
    valor_causa: 'R$ 847.320,00',
    local: '2ª Vara de Execuções Fiscais — Comarca de São Paulo/SP',
  },
  conclusoes: [
    {
      id: 1,
      tipo: 'prescricao',
      severidade: 'favoravel',
      titulo: 'Prescrição Intercorrente Configurada',
      resumo: 'O prazo prescricional de 5 anos (art. 40, LEF) iniciado em 15/03/2019 findou-se em 15/03/2024. A citação ocorreu apenas em 22/07/2024, portanto, após o decurso do prazo prescricional.',
      fundamento_legal: 'Art. 40 da Lei nº 6.830/1980 (LEF); Súmula 150 do STJ.',
      confianca: 94,
    },
    {
      id: 2,
      tipo: 'decadencia',
      severidade: 'favoravel',
      titulo: 'Decadência Parcialmente Reconhecida',
      resumo: 'Os créditos tributários relativos aos exercícios de 2018 e 2019 encontram-se decadidos, nos termos do art. 173 do CTN. O lançamento ocorreu em 15/05/2021, ultrapassando o prazo decadencial de 5 anos contados do primeiro dia do exercício seguinte.',
      fundamento_legal: 'Art. 173, caput e §1º, do CTN; Súmula 430 do STF.',
      confianca: 91,
    },
    {
      id: 3,
      tipo: 'cautela',
      severidade: 'atencao',
      titulo: 'Atenção: CDA Pode Ter Sido Renovada',
      resumo: 'Verifica-se menção a "Certidão de Dívida Ativa Renovada" no documento SISBAJUD. Recomenda-se conferir se a inscrição original ocorreu dentro do prazo decadencial, pois a renovação não interrompe a decadência (entendimento majoritário do STJ).',
      fundamento_legal: 'Súmula 430, STF; RE 1.064.937 (STF, Min. Gilmar Mendes).',
      confianca: 78,
    },
    {
      id: 4,
      tipo: 'procedimental',
      severidade: 'neutro',
      titulo: 'Intimação Pessoal Efetivada',
      resumo: 'O Mandado de Citação foi cumprido pessoalmente ao representante legal da empresa em 22/07/2024, conforme termo de ciência juntado aos autos. Não há vício de citação a ser arguido.',
      fundamento_legal: 'Art. 274, CPC/2015; Art. 7º, §2º, LEF.',
      confianca: 97,
    },
  ],
  fatos_importantes: [
    {
      id: 1,
      categoria: 'cronologica',
      data: '15/03/2019',
      descricao: 'Data-base do Fato Gerador (último ato praticado pela Fazenda Nacional antes da inscrição em dívida ativa).',
      fonte: 'CDA nº 2021/0847321, fl. 3',
      relevancia: 'alta',
    },
    {
      id: 2,
      categoria: 'cronologica',
      data: '15/05/2021',
      descricao: 'Data da inscrição do crédito tributário em Dívida Ativa (lançamento definitivo).',
      fonte: 'CDA, fl. 1; SISBAJUD',
      relevancia: 'alta',
    },
    {
      id: 3,
      categoria: 'cronologica',
      data: '15/03/2024',
      descricao: 'Término do prazo prescricional de 5 anos contados da data do lançamento (art. 40, LEF).',
      fonte: 'Cálculo automático — Cérebro Tributário',
      relevancia: 'critica',
    },
    {
      id: 4,
      categoria: 'processual',
      data: '22/07/2024',
      descricao: 'Citação pessoal do executado. A ação foi ajuizada em 10/06/2024, mas a citação só ocorreu em 22/07/2024.',
      fonte: 'Mandado de Citação, fls. 45-46',
      relevancia: 'critica',
    },
    {
      id: 5,
      categoria: 'processual',
      data: '10/06/2024',
      descricao: 'Ajuizamento da Execução Fiscal pela Fazenda Nacional.',
      fonte: 'Petição Inicial, fl. 1',
      relevancia: 'media',
    },
    {
      id: 6,
      categoria: 'tributaria',
      data: '31/12/2018',
      descricao: 'Término do exercício de 2018. O prazo decadencial para os tributos deste exercício venceu em 01/01/2024.',
      fonte: 'DCTF — Exercício 2018',
      relevancia: 'alta',
    },
  ],
  raciocinio: [
    {
      id: 1,
      premissa: 'O art. 40 da LEF estabelece prazo prescricional de 5 anos para a execução fiscal, contados da data do lançamento.',
      aplicacao: 'O lançamento ocorreu em 15/05/2021. O prazo findou-se em 15/05/2026. Contudo, a ação foi ajuizada em 10/06/2024 (dentro do prazo), mas a citação só ocorreu em 22/07/2024.',
      conclusao_logica: 'A citação em execução fiscal é ato interruptivo da prescrição (art. 117, CTN). No entanto, a prescrição intercorrente exige que a citação ocorra dentro do prazo. Como a citação ocorreu após o decurso do prazo prescricional (considerando a data do fato gerador como marco inicial), há prescrição intercorrente.',
      referencia: 'STJ, REsp 1.723.456, Rel. Min. Napoleão Nunes Maia Filho.',
    },
    {
      id: 2,
      premissa: 'O art. 173 do CTN estabelece prazo decadencial de 5 anos, contados do primeiro dia do exercício seguinte ao da ocorrência do fato gerador.',
      aplicacao: 'Para o exercício de 2018, o fato gerador ocorreu durante o ano. O prazo decadencial iniciou-se em 01/01/2019 e findou-se em 01/01/2024. A inscrição em dívida ativa ocorreu em 15/05/2021.',
      conclusao_logica: 'A inscrição ocorreu dentro do prazo decadencial para o exercício de 2018. No entanto, o lançamento definitivo (inscrição em dívida ativa) só consolidou o crédito em 2021. Para os exercícios de 2018 e 2019, a decadência está configurada se considerarmos que o lançamento deveria ter ocorrido até 01/01/2024.',
      referencia: 'STF, RE 1.064.937, Rel. Min. Gilmar Mendes; Súmula 430, STF.',
    },
    {
      id: 3,
      premissa: 'A Súmula 430 do STF estabelece que a inscrição em dívida ativa não interrompe a decadência.',
      aplicacao: 'A CDA foi inscrita em 15/05/2021. Posteriormente, foi "renovada" conforme registro no SISBAJUD.',
      conclusao_logica: 'Mesmo que haja renovação da CDA, o entendimento majoritário do STJ é de que a renovação não reinicia o prazo decadencial. O crédito relativo aos exercícios de 2018 e 2019 encontra-se decadido.',
      referencia: 'STJ, AgInt no AREsp 1.234.567, Rel. Min. Regina Helena Costa.',
    },
  ],
  recomendacoes: [
    'Arguir prescrição intercorrente em preliminar de contestação, com fundamento no art. 40 da LEF.',
    'Requerer, subsidiariamente, o reconhecimento da decadência dos créditos dos exercícios de 2018 e 2019.',
    'Solicitar vista dos autos no SISBAJUD para verificar a data exata da primeira inscrição em dívida ativa.',
    'Preparar memoriais de defesa citando a Súmula 150 do STJ e o REsp 1.723.456 do STJ.',
    'Considerar a possibilidade de transação tributária para os créditos não atingidos pela prescrição/decadência.',
  ],
};

// ============================================
// COMPONENTE: BADGE DE SEVERIDADE
// ============================================
const BadgeSeveridade = ({ tipo }) => {
  const configs = {
    favoravel: { bg: 'bg-gold/10', text: 'text-gold', border: 'border-gold/30', label: 'Favorável', icon: CheckCircle2 },
    atencao: { bg: 'bg-amber-500/10', text: 'text-amber-300', border: 'border-amber-500/30', label: 'Atenção', icon: AlertTriangle },
    neutro: { bg: 'bg-white/5', text: 'text-parchment/60', border: 'border-line', label: 'Neutro', icon: Shield },
    desfavoravel: { bg: 'bg-red-500/10', text: 'text-red-300', border: 'border-red-500/30', label: 'Desfavorável', icon: AlertTriangle },
  };

  const config = configs[tipo] || configs.neutro;
  const Icon = config.icon;

  // `anim-seal`: o veredito não "aparece", ele é CARIMBADO. É a micro-interação
  // que dá peso ao momento em que o usuário lê a severidade da conclusão.
  return (
    <span className={`anim-seal inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border}`}>
      <Icon size={12} />
      {config.label}
    </span>
  );
};

// ============================================
// COMPONENTE: CARD DE CONCLUSÃO
// ============================================
const CardConclusao = ({ conclusao, expandido, onToggle, indice = 0 }) => {
  return (
    <div
      style={{ '--i': indice }}
      className={`reveal mi-lift group bg-ink-800/50 rounded-xl border overflow-hidden ${
      conclusao.severidade === 'favoravel' ? 'border-gold/30' :
      conclusao.severidade === 'atencao' ? 'border-amber-500/30' :
      'border-line'
    }`}>
      <button
        onClick={onToggle}
        className="cursor-gavel w-full px-5 py-4 flex items-start gap-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className={`
          w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
          ${conclusao.severidade === 'favoravel' ? 'bg-gold/15' :
            conclusao.severidade === 'atencao' ? 'bg-amber-500/15' :
            'bg-ink-700'
          }
        `}>
          <Scale size={18} className={`mi-icon ${
            conclusao.severidade === 'favoravel' ? 'text-gold' :
            conclusao.severidade === 'atencao' ? 'text-amber-400' :
            'text-parchment/50'
          }`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-parchment">{conclusao.titulo}</h4>
            <BadgeSeveridade tipo={conclusao.severidade} />
          </div>
          <p className="text-sm text-parchment/50 mt-1 line-clamp-2">{conclusao.resumo}</p>
          
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <Brain size={12} className="text-parchment/40" />
              <span className="text-xs text-parchment/40">Confiança: {conclusao.confianca}%</span>
              <div className="w-16 h-1.5 bg-ink-700 rounded-full overflow-hidden">
                {/* cresce da esquerda: a confiança é "medida" na frente do usuário */}
                <div
                  className={`anim-grow-x h-full rounded-full ${
                    conclusao.confianca >= 90 ? 'bg-gold' :
                    conclusao.confianca >= 75 ? 'bg-amber-500/100' : 'bg-red-500/100'
                  }`}
                  style={{ width: `${conclusao.confianca}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div
          className={`text-parchment/40 mt-1 transition-transform duration-300 ease-decide ${
            expandido ? 'rotate-180' : ''
          }`}
        >
          <ChevronDown size={18} />
        </div>
      </button>

      {expandido && (
        <div className="px-5 pb-5 pt-2 border-t border-line bg-white/[0.02]">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-parchment/50 uppercase tracking-wider mb-1">Análise Detalhada</p>
              <p className="text-sm text-parchment/80 leading-relaxed">{conclusao.resumo}</p>
            </div>
            <div className="flex items-start gap-2 p-3 bg-ink-700 rounded-lg">
              <BookOpen size={14} className="text-parchment/50 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-parchment/50">Fundamento Legal</p>
                <p className="text-sm text-parchment/80">{conclusao.fundamento_legal}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================
// COMPONENTE: CARD DE FATO
// ============================================
const CardFato = ({ fato, indice = 0 }) => {
  const relevanciaCores = {
    critica: 'bg-red-500/10 text-red-300 border-red-500/30',
    alta: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    media: 'bg-white/5 text-parchment/70 border-line',
    baixa: 'bg-white/5 text-parchment/60 border-line',
  };

  const categoriaIcones = {
    cronologica: Calendar,
    processual: Gavel,
    tributaria: Scale,
  };

  const Icon = categoriaIcones[fato.categoria] || FileText;

  return (
    // reveal-x: a timeline entra lateralmente, reforçando a leitura cronológica
    <div
      style={{ '--i': indice }}
      className="reveal-x mi-lift group flex gap-4 p-4 bg-ink-800/50 rounded-xl border border-line hover:border-gold/40"
    >
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 rounded-lg bg-ink-700 flex items-center justify-center">
          <Icon size={18} className="mi-icon text-parchment/50" />
        </div>
        <div className="w-px flex-1 bg-ink-600" />
      </div>

      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-bold text-parchment">{fato.data}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase ${relevanciaCores[fato.relevancia]}`}>
            {fato.relevancia}
          </span>
        </div>
        <p className="text-sm text-parchment/80 leading-relaxed">{fato.descricao}</p>
        <div className="flex items-center gap-1.5 mt-2 text-xs text-parchment/40">
          <FileText size={12} />
          <span>Fonte: {fato.fonte}</span>
        </div>
      </div>
    </div>
  );
};

// ============================================
// COMPONENTE: CARD DE RACIOCÍNIO
// ============================================
const CardRaciocinio = ({ raciocinio, index }) => {
  const [copiado, setCopiado] = useState(false);

  const copiarTexto = () => {
    const texto = `Premissa: ${raciocinio.premissa}\n\nAplicação: ${raciocinio.aplicacao}\n\nConclusão: ${raciocinio.conclusao_logica}\n\nReferência: ${raciocinio.referencia}`;
    navigator.clipboard.writeText(texto);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };

  return (
    <div
      style={{ '--i': index }}
      className="reveal mi-lift bg-ink-800/50 rounded-xl border border-line p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gold/15 flex items-center justify-center text-xs font-bold text-gold">
            {index + 1}
          </div>
          <span className="text-xs font-semibold text-parchment/40 uppercase tracking-wider">Silogismo Jurídico</span>
        </div>
        <button
          onClick={copiarTexto}
          className="mi-press flex items-center gap-1.5 text-xs text-parchment/40 hover:text-gold transition-colors px-2 py-1 rounded-lg hover:bg-gold/10"
        >
          {copiado ? <Check size={13} className="anim-seal" /> : <Copy size={13} />}
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      <div className="space-y-3">
        <div className="p-3 bg-white/5 rounded-lg border-l-3 border-l-line">
          <p className="text-[10px] font-bold text-parchment/40 uppercase mb-1">Premissa (Major)</p>
          <p className="text-sm text-parchment/80 leading-relaxed">{raciocinio.premissa}</p>
        </div>

        <div className="p-3 bg-gold/[0.06] rounded-lg border-l-3 border-l-gold/50">
          <p className="text-[10px] font-bold text-gold/70 uppercase mb-1">Aplicação ao Caso Concreto (Minor)</p>
          <p className="text-sm text-parchment/80 leading-relaxed">{raciocinio.aplicacao}</p>
        </div>

        <div className="p-3 bg-gold/[0.06] rounded-lg border-l-3 border-l-gold">
          <p className="text-[10px] font-bold text-gold uppercase mb-1">Conclusão Lógica</p>
          <p className="text-sm text-parchment font-medium leading-relaxed">{raciocinio.conclusao_logica}</p>
        </div>

        <div className="flex items-start gap-2 pt-2 border-t border-line">
          <Gavel size={14} className="text-parchment/40 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-parchment/50 italic">{raciocinio.referencia}</p>
        </div>
      </div>
    </div>
  );
};

// ============================================
// NORMALIZAÇÃO DO RESULTADO DA IA
// ============================================
// A IA pode devolver um JSON incompleto ou com um campo no tipo errado
// (ex.: `conclusoes` como objeto em vez de array). Antes, um `.map`/`.filter`
// sobre esse valor lançava erro em pleno render — o React desmontava a árvore
// inteira e a tela "piscava e sumia". Aqui garantimos um formato seguro.
const garantirArray = (v) => (Array.isArray(v) ? v : []);

// Placeholders neutros. Campos essenciais caem para "Não identificado" quando a
// IA não consegue extrair o dado dos documentos — nunca quebram a tela.
const NAO_IDENT = 'Não identificado';
const METADATA_NEUTRA = {
  id_analise: '—',
  data_analise: new Date().toLocaleDateString('pt-BR'),
  processo: NAO_IDENT,
  parte_autora: NAO_IDENT,
  parte_reu: NAO_IDENT,
  valor_causa: NAO_IDENT,
  local: NAO_IDENT, // Comarca / Vara / Tribunal
};

// Substitui valores vazios/placeholder da IA por "Não identificado".
const AUSENTE = new Set(['', '-', '—', 'n/a', 'na', 'null', 'undefined', 'nao informado', 'não informado']);
function limparCampo(v) {
  if (v == null) return NAO_IDENT;
  const s = String(v).trim();
  return s === '' || AUSENTE.has(s.toLowerCase()) ? NAO_IDENT : s;
}

function normalizarResultado(analise) {
  if (!analise || typeof analise !== 'object') return RESULTADO_MOCK;

  const metaBruto = { ...METADATA_NEUTRA, ...(analise.metadata || {}) };

  return {
    ...RESULTADO_MOCK,
    ...analise,
    metadata: {
      ...metaBruto,
      parte_autora: limparCampo(metaBruto.parte_autora),
      parte_reu: limparCampo(metaBruto.parte_reu),
      valor_causa: limparCampo(metaBruto.valor_causa),
      local: limparCampo(metaBruto.local),
      processo: limparCampo(metaBruto.processo),
    },
    conclusoes: garantirArray(analise.conclusoes),
    fatos_importantes: garantirArray(analise.fatos_importantes),
    raciocinio: garantirArray(analise.raciocinio),
    recomendacoes: garantirArray(analise.recomendacoes).map((r) =>
      typeof r === 'string' ? r : String(r?.texto ?? r?.descricao ?? JSON.stringify(r)),
    ),
  };
}

// ============================================
// COMPONENTE PRINCIPAL: RESULTADO DA ANÁLISE
// ============================================
const ResultadoAnalise = ({ analise, user, onVoltar, onNovaAnalise, onReanalisar }) => {
  const [abaAtiva, setAbaAtiva] = useState('conclusoes');
  const [conclusaoExpandida, setConclusaoExpandida] = useState(1);

  // Revela os blocos do parecer em cascata conforme entram na tela. Re-observa
  // a cada troca de aba, já que o conteúdo é remontado do zero.
  const refConteudo = useRevelar([abaAtiva]);

  // Usa o resultado real da IA (normalizado) ou o mock, se não houver análise.
  const resultado = analise ? normalizarResultado(analise) : RESULTADO_MOCK;
  const analiseId = analise?.id || resultado?.id || null;
  const casoId = analise?.caso_id || null;
  const versao = analise?.versao || 1;

  // ---- Timeline: ordena por data ---------------------------------------------
  // O rótulo da aba promete "Timeline cronológica", mas a lista era renderizada
  // na ordem em que o modelo devolveu — e execuções reais vieram fora de ordem
  // (30/04/2008 -> 08/01/2010 -> 30/04/2009). A ordenação passa a ser garantida
  // aqui, no código, em vez de confiada ao modelo.
  //
  // Datas vêm como "DD/MM/AAAA". Uma data ausente ou malformada vai para o FIM
  // da lista em vez de sumir ou quebrar a ordenação dos demais.
  const fatosOrdenados = useMemo(
    () => ordenarFatosPorData(resultado.fatos_importantes),
    [resultado.fatos_importantes],
  );

  // ---- Anotações do usuário -------------------------------------------------
  const [obs, setObs] = useState(analise?.observacoes || '');
  const [salvandoObs, setSalvandoObs] = useState(false);
  const [obsSalvoEm, setObsSalvoEm] = useState(analise?.observacoes_em || null);
  const [obsSujo, setObsSujo] = useState(false);

  useEffect(() => {
    // Ao abrir outra análise, sincroniza o campo.
    setObs(analise?.observacoes || '');
    setObsSalvoEm(analise?.observacoes_em || null);
    setObsSujo(false);
  }, [analiseId, analise?.observacoes]);

  const handleSalvarObs = async () => {
    if (!analiseId) return;
    setSalvandoObs(true);
    const { ok, em } = await salvarObservacoes(analiseId, obs);
    setSalvandoObs(false);
    if (ok) {
      setObsSalvoEm(em);
      setObsSujo(false);
    }
  };

  // ---- Downloads ------------------------------------------------------------
  const nomeArquivo = (ext) =>
    `Parecer_${(resultado.metadata.parte_reu || 'analise')
      .replace(/[^\w]+/g, '_')
      .slice(0, 40)}_${new Date().toISOString().slice(0, 10)}.${ext}`;

  const baixarBlob = (conteudo, mime, ext) => {
    const blob = new Blob([conteudo], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo(ext);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const baixarTxt = () =>
    baixarBlob(gerarConteudoParecer(resultado, obs), 'text/plain;charset=utf-8', 'txt');

  const baixarDoc = () =>
    baixarBlob(
      '﻿' + gerarHtmlParecer(resultado, obs),
      'application/msword;charset=utf-8',
      'doc',
    );

  const abas = [
    { id: 'conclusoes', label: 'Conclusões', icon: CheckCircle2, count: resultado.conclusoes?.length || 0 },
    { id: 'fatos', label: 'Fatos Importantes', icon: FileText, count: resultado.fatos_importantes?.length || 0 },
    { id: 'raciocinio', label: 'Raciocínio Lógico', icon: Brain, count: resultado.raciocinio?.length || 0 },
    { id: 'recomendacoes', label: 'Recomendações', icon: Gavel, count: resultado.recomendacoes?.length || 0 },
    { id: 'anotacoes', label: 'Anotações do usuário', icon: Pencil, count: obs.trim() ? 1 : 0 },
  ];

  return (
    <div className="min-h-screen bg-noir">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-7">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <button
                onClick={onVoltar}
                className="shrink-0 p-2 text-parchment/40 hover:text-parchment hover:bg-ink-700 rounded-lg transition-all"
              >
                <ArrowLeft size={20} />
              </button>

              <Logo size="md" showWordmark={false} className="shrink-0" />
              <span className="hidden h-11 w-px shrink-0 bg-line sm:block" aria-hidden="true" />

              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl font-bold text-parchment truncate flex items-center gap-2">
                  Resultado da Análise
                  {versao > 1 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/5 text-parchment/60 border border-line flex-shrink-0">
                      <History size={10} /> versão {versao}
                    </span>
                  )}
                </h1>
                <p className="text-sm text-parchment/50 truncate">
                  {resultado.metadata.processo !== 'Não identificado'
                    ? `Processo ${resultado.metadata.processo} • `
                    : ''}
                  {resultado.metadata.data_analise}
                </p>
              </div>
            </div>

            <div className="no-print flex items-center gap-2 sm:gap-3 shrink-0">
              <button
                onClick={() => window.print()}
                title="Imprimir ou salvar em PDF"
                className="mi-press cursor-gavel hidden md:flex items-center gap-2 px-3 py-2 text-sm font-medium text-parchment/60 bg-ink-800/50 border border-line rounded-lg hover:bg-white/5 hover:border-gold/30 transition-all"
              >
                <Printer size={16} />
                PDF
              </button>
              <button
                onClick={baixarTxt}
                title="Baixar em texto puro (.txt)"
                className="mi-press cursor-gavel hidden md:flex items-center gap-2 px-3 py-2 text-sm font-medium text-parchment/60 bg-ink-800/50 border border-line rounded-lg hover:bg-white/5 hover:border-gold/30 transition-all"
              >
                <FileText size={16} />
                .txt
              </button>
              <button
                onClick={baixarDoc}
                className="mi-press mi-sheen cursor-gavel flex items-center gap-2 px-3 sm:px-5 py-2.5 text-sm font-semibold text-ink bg-gold hover:bg-gold-soft rounded-lg shadow-lg shadow-[var(--shadow-gold)] transition-all"
              >
                <FileType2 size={16} />
                <span className="hidden sm:inline">Baixar em Word</span>
                <span className="sm:hidden">Word</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-ink-800/50 border-b border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] font-bold text-parchment/40 uppercase tracking-wider">Parte Autora</p>
              <p className="text-sm font-medium text-parchment/80 truncate">{resultado.metadata.parte_autora}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-parchment/40 uppercase tracking-wider">Parte Ré</p>
              <p className="text-sm font-medium text-parchment/80 truncate">{resultado.metadata.parte_reu}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-parchment/40 uppercase tracking-wider">Valor da Causa</p>
              <p className="text-sm font-medium text-gold">{resultado.metadata.valor_causa}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-parchment/40 uppercase tracking-wider">Local</p>
              <p className="text-sm font-medium text-parchment/80 truncate" title={resultado.metadata.local}>
                {resultado.metadata.local}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-4">
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0 text-amber-400" />
          <p className="text-xs leading-relaxed text-amber-200/90">
            Parecer gerado por <strong>inteligência artificial</strong> a partir
            exclusivamente dos documentos enviados. <strong>Não constitui aconselhamento
            jurídico.</strong> Revise os cálculos, datas e fundamentos antes de qualquer
            uso profissional — a responsabilidade pela validação é do(a) advogado(a).
          </p>
        </div>
      </div>

      <div className="no-print bg-ink-800/50 border-b border-line sm:sticky sm:top-[73px] z-30">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <div className="flex gap-1 -mb-px overflow-x-auto no-scrollbar">
            {abas.map((aba) => {
              const Icon = aba.icon;
              const ativa = abaAtiva === aba.id;
              return (
                <button
                  key={aba.id}
                  onClick={() => setAbaAtiva(aba.id)}
                  className={`
                    group mi-press cursor-gavel relative flex shrink-0 items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium transition-colors duration-200
                    ${ativa ? 'text-gold' : 'text-parchment/50 hover:text-parchment hover:bg-white/5'}
                  `}
                >
                  {/* sublinhado que CRESCE do centro em vez de piscar de uma aba
                      para outra — dá continuidade ao gesto de trocar de seção */}
                  <span
                    aria-hidden="true"
                    className={`absolute inset-x-0 bottom-0 h-0.5 origin-center bg-gold transition-transform duration-300 ease-decide ${
                      ativa ? 'scale-x-100' : 'scale-x-0'
                    }`}
                  />
                  <Icon size={16} className="mi-icon" />
                  {aba.label}
                  <span className={`
                    text-xs px-1.5 py-0.5 rounded-full
                    ${ativa ? 'bg-gold/15 text-gold' : 'bg-ink-700 text-parchment/50'}
                  `}>
                    {aba.count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <main ref={refConteudo} className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {abaAtiva === 'conclusoes' && (
          <div className="space-y-4" data-stagger>
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <h2 className="text-lg font-bold text-parchment">Conclusões da IA</h2>
              <div className="flex items-center gap-2 text-sm text-parchment/50">
                <CheckCircle2 size={16} className="text-gold" />
                <span>{resultado.conclusoes?.filter(c => c.severidade === 'favoravel').length || 0} favoráveis</span>
                <span className="text-parchment/30">•</span>
                <AlertTriangle size={16} className="text-amber-400" />
                <span>{resultado.conclusoes?.filter(c => c.severidade === 'atencao').length || 0} atenção</span>
              </div>
            </div>
            {resultado.conclusoes?.map((conclusao, i) => (
              <CardConclusao
                key={conclusao.id}
                indice={i}
                conclusao={conclusao}
                expandido={conclusaoExpandida === conclusao.id}
                onToggle={() => setConclusaoExpandida(
                  conclusaoExpandida === conclusao.id ? null : conclusao.id
                )}
              />
            ))}
          </div>
        )}

        {abaAtiva === 'fatos' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-parchment">Fatos Importantes Extraídos</h2>
              <span className="text-sm text-parchment/50">Timeline cronológica</span>
            </div>
            <div className="space-y-3" data-stagger>
              {fatosOrdenados.map((fato, i) => (
                <CardFato key={fato.id} fato={fato} indice={i} />
              ))}
            </div>
          </div>
        )}

        {abaAtiva === 'raciocinio' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-parchment">Raciocínio Lógico da IA</h2>
              <span className="text-sm text-parchment/50">Silogismos jurídicos aplicados</span>
            </div>
            <div className="space-y-4" data-stagger>
              {resultado.raciocinio?.map((r, i) => (
                <CardRaciocinio key={r.id} raciocinio={r} index={i} />
              ))}
            </div>
          </div>
        )}

        {abaAtiva === 'recomendacoes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-parchment">Recomendações Estratégicas</h2>
              <span className="text-sm text-parchment/50">Ações sugeridas pela IA</span>
            </div>
            <div className="bg-ink-800/50 rounded-xl border border-line p-6">
              <div className="space-y-2" data-stagger>
                {resultado.recomendacoes?.map((rec, i) => (
                  <div
                    key={i}
                    style={{ '--i': i }}
                    className="reveal mi-row group flex items-start gap-4 rounded-lg px-3 py-2 hover:bg-gold/[0.05]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-gold/15 flex items-center justify-center flex-shrink-0">
                      <span className="mi-icon text-sm font-bold text-gold">{i + 1}</span>
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="text-sm text-parchment/80 leading-relaxed">{rec}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {abaAtiva === 'anotacoes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
              <h2 className="text-lg font-bold text-parchment">Anotações do usuário</h2>
              <span className="text-sm text-parchment/50">Correções e observações sobre o parecer</span>
            </div>
            <div className="bg-ink-800/50 rounded-xl border border-line p-5 sm:p-6">
              {analiseId ? (
                <>
                  <p className="mb-3 text-xs text-parchment/45">
                    Registre aqui o que a IA errou ou o que precisa ser ajustado — por exemplo:
                    <span className="text-parchment/65"> "A CDCT correta é 01/01/2027, não a apurada pela IA."</span>
                    {' '}As anotações ficam salvas com a análise e entram nos downloads (.txt / Word).
                  </p>
                  <textarea
                    value={obs}
                    onChange={(e) => {
                      setObs(e.target.value);
                      setObsSujo(true);
                    }}
                    rows={8}
                    placeholder="Suas observações, correções e ressalvas..."
                    className="w-full resize-y rounded-lg border border-line bg-ink-900 px-4 py-3 text-sm text-parchment
                               placeholder:text-parchment/25 outline-none transition-all
                               focus:border-gold/50 focus:ring-2 focus:ring-gold/15"
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <span className="text-xs text-parchment/40">
                      {salvandoObs
                        ? 'Salvando...'
                        : obsSujo
                          ? 'Alterações não salvas'
                          : obsSalvoEm
                            ? `Salvo em ${new Date(obsSalvoEm).toLocaleString('pt-BR')}`
                            : 'Nada salvo ainda'}
                    </span>
                    <button
                      onClick={handleSalvarObs}
                      disabled={salvandoObs || !obsSujo}
                      className="inline-flex items-center gap-2 rounded-lg bg-gold px-4 py-2 text-sm font-semibold text-ink
                                 transition-all hover:bg-gold-soft disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {salvandoObs ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                      Salvar anotações
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-parchment/50">
                  As anotações ficam disponíveis assim que a análise é salva no histórico.
                  Aguarde alguns segundos ou reabra a análise pelo Histórico.
                </p>
              )}
            </div>
          </div>
        )}

      </main>

      <ChatLuFlutuante casoId={casoId} analiseId={analiseId} user={user} />

      <div className="no-print max-w-6xl mx-auto px-4 sm:px-6 pb-12">
        <div className="bg-gradient-to-r from-gold to-gold-soft rounded-2xl p-6 sm:p-8 text-center text-ink shadow-xl">
          <h3 className="text-xl font-bold mb-2">Precisa de uma nova análise?</h3>
          <p className="text-ink/70 mb-6">Processe novos documentos e obtenha insights tributários em segundos.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            {casoId && (
              <button
                onClick={() => onReanalisar?.({ caso_id: casoId, titulo: resultado.metadata.parte_reu })}
                className="inline-flex items-center gap-2 px-6 py-3 bg-ink-800/50 text-gold font-semibold rounded-xl hover:bg-gold/10 transition-all shadow-lg"
                title="Adiciona um documento novo a este caso e gera uma nova versão do parecer, sem apagar o atual"
              >
                <FilePlus2 size={16} />
                Adicionar documento a este caso
              </button>
            )}
            <button
              onClick={onNovaAnalise}
              className="px-6 py-3 bg-ink-900/60 text-parchment/80 font-semibold rounded-xl hover:bg-ink-900 transition-all shadow-lg border border-line"
            >
              Iniciar Nova Análise
            </button>
          </div>
        </div>
      </div>

      <div className="no-print">
        <RodapeLegal />
      </div>
    </div>
  );
};

function gerarConteudoParecer(resultado, observacoes = '') {
  const { metadata, conclusoes = [], raciocinio = [], recomendacoes = [] } = resultado;
  const fatos_importantes = ordenarFatosPorData(resultado.fatos_importantes);

  const blocoAnotacoes = observacoes && observacoes.trim()
    ? `
================================================================================
                 ANOTAÇÕES E CORREÇÕES DO ADVOGADO
================================================================================

${observacoes.trim()}
`
    : '';

  return `================================================================================
                    PARECER TRIBUTÁRIO — TRIBUTÁGIL
================================================================================

IDENTIFICAÇÃO DO PARECER
────────────────────────────────────────────────────────────────────────────────
Número da Análise:    ${metadata.id_analise}
Data:                 ${metadata.data_analise}

IDENTIFICAÇÃO DO PROCESSO
────────────────────────────────────────────────────────────────────────────────
Número:               ${metadata.processo}
Parte Autora:         ${metadata.parte_autora}
Parte Ré:             ${metadata.parte_reu}
Valor da Causa:       ${metadata.valor_causa}
Local:                ${metadata.local}

================================================================================
                        I. CONCLUSÕES DA ANÁLISE
================================================================================

${conclusoes.map((c, i) => `
${i + 1}. ${c.titulo?.toUpperCase()}
   Severidade: ${c.severidade?.toUpperCase()} | Confiança da IA: ${c.confianca}%

   ${c.resumo}

   Fundamento Legal: ${c.fundamento_legal}
`).join('\n')}

================================================================================
                      II. FATOS RELEVANTES EXTRAÍDOS
================================================================================

${fatos_importantes.map((f, i) => `
[${f.data}] — ${f.categoria?.toUpperCase()} (${f.relevancia?.toUpperCase()})
${f.descricao}
Fonte: ${f.fonte}
`).join('\n')}

================================================================================
                      III. RACIOCÍNIO LÓGICO APLICADO
================================================================================

${raciocinio.map((r, i) => `
Silogismo ${i + 1}:
─────────────────
PREMISSA (Major): ${r.premissa}

APLICAÇÃO (Minor): ${r.aplicacao}

CONCLUSÃO: ${r.conclusao_logica}

Referência: ${r.referencia}
`).join('\n')}

================================================================================
                      IV. RECOMENDAÇÕES ESTRATÉGICAS
================================================================================

${recomendacoes.map((r, i) => `${i + 1}. ${r}`).join('\n')}
${blocoAnotacoes}
================================================================================
                             V. DISCLAIMER
================================================================================

O presente parecer foi gerado por inteligência artificial (Cérebro Tributário)
e deve ser revisado por advogado habilitado antes de sua apresentação
em juízo. A análise baseia-se exclusivamente nos documentos fornecidos e na
legislação vigente à data de processamento. O TributÁgil não se responsabiliza
por decisões judiciais baseadas unicamente neste documento.

================================================================================
"Da decadência à prescrição, o TributÁgil é a sua solução."
================================================================================
`;
}

// Escapa texto para inserção segura em HTML.
function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Gera um documento HTML compatível com Word (.doc). O Word abre HTML com este
// MIME nativamente e preserva títulos, negrito, listas e tabelas — sem
// nenhuma biblioteca de terceiros.
function gerarHtmlParecer(resultado, observacoes = '') {
  const { metadata, conclusoes = [], raciocinio = [], recomendacoes = [] } = resultado;
  const fatos_importantes = ordenarFatosPorData(resultado.fatos_importantes);

  const secAnotacoes =
    observacoes && observacoes.trim()
      ? `<h2>Anotações e correções do usuário</h2>
         <p style="white-space:pre-wrap">${esc(observacoes.trim())}</p>`
      : '';

  return `<!doctype html>
<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8" />
<title>Parecer Tributário — TributÁgil</title>
<style>
  body { font-family: Georgia, "Times New Roman", serif; font-size: 12pt; color: #1a1a1a; line-height: 1.5; }
  h1 { font-size: 18pt; text-align: center; margin: 0 0 4pt; }
  .sub { text-align: center; color: #555; font-size: 10pt; margin: 0 0 18pt; }
  h2 { font-size: 13pt; border-bottom: 1px solid #999; padding-bottom: 2pt; margin: 22pt 0 8pt; }
  h3 { font-size: 12pt; margin: 12pt 0 4pt; }
  table { border-collapse: collapse; width: 100%; margin: 6pt 0; font-size: 11pt; }
  td, th { border: 1px solid #bbb; padding: 4pt 6pt; text-align: left; vertical-align: top; }
  .rotulo { color: #555; font-size: 10pt; }
  .disc { font-size: 10pt; color: #555; border-top: 1px solid #ccc; margin-top: 22pt; padding-top: 8pt; }
</style>
</head>
<body>
  <h1>Parecer Tributário</h1>
  <p class="sub">Gerado por TributÁgil (IA) &middot; ${esc(metadata.data_analise)}</p>

  <h2>Identificação</h2>
  <table>
    <tr><td class="rotulo">Nº da análise</td><td>${esc(metadata.id_analise)}</td></tr>
    <tr><td class="rotulo">Processo</td><td>${esc(metadata.processo)}</td></tr>
    <tr><td class="rotulo">Parte autora</td><td>${esc(metadata.parte_autora)}</td></tr>
    <tr><td class="rotulo">Parte ré</td><td>${esc(metadata.parte_reu)}</td></tr>
    <tr><td class="rotulo">Valor da causa</td><td>${esc(metadata.valor_causa)}</td></tr>
    <tr><td class="rotulo">Local</td><td>${esc(metadata.local)}</td></tr>
  </table>

  <h2>I. Conclusões</h2>
  ${conclusoes
    .map(
      (c, i) => `<h3>${i + 1}. ${esc(c.titulo)}</h3>
      <p class="rotulo">Severidade: ${esc(c.severidade)} &middot; Confiança da IA: ${esc(c.confianca)}%</p>
      <p>${esc(c.resumo)}</p>
      <p><strong>Fundamento legal:</strong> ${esc(c.fundamento_legal)}</p>`,
    )
    .join('\n')}

  <h2>II. Fatos relevantes extraídos</h2>
  <table>
    <tr><th>Data</th><th>Descrição</th><th>Fonte</th></tr>
    ${fatos_importantes
      .map(
        (f) =>
          `<tr><td>${esc(f.data)}</td><td>${esc(f.descricao)}</td><td>${esc(f.fonte)}</td></tr>`,
      )
      .join('\n')}
  </table>

  <h2>III. Raciocínio lógico aplicado</h2>
  ${raciocinio
    .map(
      (r, i) => `<h3>Silogismo ${i + 1}</h3>
      <p><strong>Premissa:</strong> ${esc(r.premissa)}</p>
      <p><strong>Aplicação:</strong> ${esc(r.aplicacao)}</p>
      <p><strong>Conclusão:</strong> ${esc(r.conclusao_logica)}</p>
      <p class="rotulo">Referência: ${esc(r.referencia)}</p>`,
    )
    .join('\n')}

  <h2>IV. Recomendações estratégicas</h2>
  <ol>${recomendacoes.map((r) => `<li>${esc(r)}</li>`).join('')}</ol>

  ${secAnotacoes}

  <p class="disc">
    Documento gerado por inteligência artificial (TributÁgil) a partir exclusivamente
    dos documentos fornecidos. Não constitui aconselhamento jurídico e deve ser
    revisado e validado por advogado(a) habilitado(a) antes de qualquer uso.
  </p>
</body>
</html>`;
}

export default ResultadoAnalise;