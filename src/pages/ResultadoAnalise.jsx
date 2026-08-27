// src/pages/ResultadoAnalise.jsx
import React, { useState } from 'react';
import {
  FileText,
  Download,
  Scale,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Shield,
  BookOpen,
  Gavel,
  ArrowLeft,
  Printer,
  Share2,
  Copy,
  Check,
  Brain,
  Calendar,
  Hash
} from 'lucide-react';

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

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border}`}>
      <Icon size={12} />
      {config.label}
    </span>
  );
};

// ============================================
// COMPONENTE: CARD DE CONCLUSÃO
// ============================================
const CardConclusao = ({ conclusao, expandido, onToggle }) => {
  return (
    <div className={`bg-ink-800/50 rounded-xl border transition-all duration-300 overflow-hidden ${
      conclusao.severidade === 'favoravel' ? 'border-gold/30 shadow-sm shadow-none' :
      conclusao.severidade === 'atencao' ? 'border-amber-500/30 shadow-sm shadow-none' :
      'border-line'
    }`}>
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-start gap-4 text-left hover:bg-white/[0.03] transition-colors"
      >
        <div className={`
          w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
          ${conclusao.severidade === 'favoravel' ? 'bg-gold/15' :
            conclusao.severidade === 'atencao' ? 'bg-amber-500/15' :
            'bg-ink-700'
          }
        `}>
          <Scale size={18} className={
            conclusao.severidade === 'favoravel' ? 'text-gold' :
            conclusao.severidade === 'atencao' ? 'text-amber-400' :
            'text-parchment/50'
          } />
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
                <div 
                  className={`h-full rounded-full ${
                    conclusao.confianca >= 90 ? 'bg-gold' :
                    conclusao.confianca >= 75 ? 'bg-amber-500/100' : 'bg-red-500/100'
                  }`}
                  style={{ width: `${conclusao.confianca}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="text-parchment/40 mt-1">
          {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
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
const CardFato = ({ fato }) => {
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
    <div className="flex gap-4 p-4 bg-ink-800/50 rounded-xl border border-line hover:border-gold/40 transition-colors">
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 rounded-lg bg-ink-700 flex items-center justify-center">
          <Icon size={18} className="text-parchment/50" />
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
    <div className="bg-ink-800/50 rounded-xl border border-line p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gold/15 flex items-center justify-center text-xs font-bold text-gold">
            {index + 1}
          </div>
          <span className="text-xs font-semibold text-parchment/40 uppercase tracking-wider">Silogismo Jurídico</span>
        </div>
        <button
          onClick={copiarTexto}
          className="flex items-center gap-1.5 text-xs text-parchment/40 hover:text-gold transition-colors px-2 py-1 rounded-lg hover:bg-gold/10"
        >
          {copiado ? <Check size={13} /> : <Copy size={13} />}
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
const ResultadoAnalise = ({ analise, onVoltar, onNovaAnalise }) => {
  const [abaAtiva, setAbaAtiva] = useState('conclusoes');
  const [conclusaoExpandida, setConclusaoExpandida] = useState(1);
  const [baixando, setBaixando] = useState(false);

  // Usa o resultado real da IA (normalizado) ou o mock, se não houver análise.
  const resultado = analise ? normalizarResultado(analise) : RESULTADO_MOCK;

  const handleDownloadParecer = async () => {
    setBaixando(true);

    await new Promise((resolve) => setTimeout(resolve, 2500));

    const conteudoParecer = gerarConteudoParecer(resultado);

    const blob = new Blob([conteudoParecer], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const rotulo = (resultado.metadata.parte_reu || 'analise')
      .replace(/[^\w]+/g, '_')
      .slice(0, 40);
    link.download = `Parecer_${rotulo}_${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setBaixando(false);
  };

  const abas = [
    { id: 'conclusoes', label: 'Conclusões', icon: CheckCircle2, count: resultado.conclusoes?.length || 0 },
    { id: 'fatos', label: 'Fatos Importantes', icon: FileText, count: resultado.fatos_importantes?.length || 0 },
    { id: 'raciocinio', label: 'Raciocínio Lógico', icon: Brain, count: resultado.raciocinio?.length || 0 },
    { id: 'recomendacoes', label: 'Recomendações', icon: Gavel, count: resultado.recomendacoes?.length || 0 },
  ];

  return (
    <div className="min-h-screen bg-noir">
      <header className="bg-ink-800/50 border-b border-line sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onVoltar}
                className="p-2 text-parchment/40 hover:text-parchment hover:bg-ink-700 rounded-lg transition-all"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <h1 className="text-xl font-bold text-parchment">Resultado da Análise</h1>
                <p className="text-sm text-parchment/50">
                  {resultado.metadata.processo !== 'Não identificado'
                    ? `Processo ${resultado.metadata.processo} • `
                    : ''}
                  {resultado.metadata.data_analise}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => window.print()}
                className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-parchment/60 bg-ink-800/50 border border-line rounded-lg hover:bg-white/5 transition-all"
              >
                <Printer size={16} />
                Imprimir
              </button>
              <button
                onClick={handleDownloadParecer}
                disabled={baixando}
                className="cursor-gavel flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-ink bg-gold hover:bg-gold-soft rounded-lg shadow-lg shadow-[var(--shadow-gold)] transition-all disabled:opacity-60"
              >
                {baixando ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Gerando PDF...
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Download do Parecer Completo
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="bg-ink-800/50 border-b border-line">
        <div className="max-w-6xl mx-auto px-6 py-4">
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

      <div className="bg-ink-800/50 border-b border-line sticky top-[73px] z-30">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex gap-1 -mb-px">
            {abas.map((aba) => {
              const Icon = aba.icon;
              const ativa = abaAtiva === aba.id;
              return (
                <button
                  key={aba.id}
                  onClick={() => setAbaAtiva(aba.id)}
                  className={`
                    flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all
                    ${ativa
                      ? 'border-gold text-gold bg-gold/[0.06]'
                      : 'border-transparent text-parchment/50 hover:text-parchment hover:bg-white/5'
                    }
                  `}
                >
                  <Icon size={16} />
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

      <main className="max-w-6xl mx-auto px-6 py-8">
        {abaAtiva === 'conclusoes' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold text-parchment">Conclusões da IA</h2>
              <div className="flex items-center gap-2 text-sm text-parchment/50">
                <CheckCircle2 size={16} className="text-gold" />
                <span>{resultado.conclusoes?.filter(c => c.severidade === 'favoravel').length || 0} favoráveis</span>
                <span className="text-parchment/30">•</span>
                <AlertTriangle size={16} className="text-amber-400" />
                <span>{resultado.conclusoes?.filter(c => c.severidade === 'atencao').length || 0} atenção</span>
              </div>
            </div>
            {resultado.conclusoes?.map((conclusao) => (
              <CardConclusao
                key={conclusao.id}
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
            <div className="space-y-3">
              {resultado.fatos_importantes?.map((fato) => (
                <CardFato key={fato.id} fato={fato} />
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
            <div className="space-y-4">
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
              <div className="space-y-4">
                {resultado.recomendacoes?.map((rec, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-gold/15 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-gold">{i + 1}</span>
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
      </main>

      <div className="max-w-6xl mx-auto px-6 pb-12">
        <div className="bg-gradient-to-r from-gold to-gold-soft rounded-2xl p-8 text-center text-ink shadow-xl">
          <h3 className="text-xl font-bold mb-2">Precisa de uma nova análise?</h3>
          <p className="text-ink/70 mb-6">Processe novos documentos e obtenha insights tributários em segundos.</p>
          <button
            onClick={onNovaAnalise}
            className="px-6 py-3 bg-ink-800/50 text-gold font-semibold rounded-xl hover:bg-gold/10 transition-all shadow-lg"
          >
            Iniciar Nova Análise
          </button>
        </div>
      </div>
    </div>
  );
};

function gerarConteudoParecer(resultado) {
  const { metadata, conclusoes = [], fatos_importantes = [], raciocinio = [], recomendacoes = [] } = resultado;

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

export default ResultadoAnalise;