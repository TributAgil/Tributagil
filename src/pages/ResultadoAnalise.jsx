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
    id_analise: 'TRB-2026-0847',
    data_analise: '26/08/2026',
    hora_analise: '14:32:18',
    advogado: 'Dr. Roberto Mendes',
    oab: 'SP-123.456',
    escritorio: 'Mendes & Advogados Associados',
    processo: '1002345-78.2024.8.26.0100',
    parte_autora: 'Fazenda Nacional',
    parte_reu: 'Indústria Alpha Ltda.',
    valor_causa: 'R$ 847.320,00',
    modelo_ia: 'Cérebro Tributário v2.1 (Gemini Backend)',
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
    favoravel: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Favorável', icon: CheckCircle2 },
    atencao: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'Atenção', icon: AlertTriangle },
    neutro: { bg: 'bg-slate-50', text: 'text-slate-600', border: 'border-slate-200', label: 'Neutro', icon: Shield },
    desfavoravel: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200', label: 'Desfavorável', icon: AlertTriangle },
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
    <div className={`bg-white rounded-xl border transition-all duration-300 overflow-hidden ${
      conclusao.severidade === 'favoravel' ? 'border-emerald-200 shadow-sm shadow-emerald-50' :
      conclusao.severidade === 'atencao' ? 'border-amber-200 shadow-sm shadow-amber-50' :
      'border-slate-200'
    }`}>
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-start gap-4 text-left hover:bg-slate-50/50 transition-colors"
      >
        <div className={`
          w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0
          ${conclusao.severidade === 'favoravel' ? 'bg-emerald-100' :
            conclusao.severidade === 'atencao' ? 'bg-amber-100' :
            'bg-slate-100'
          }
        `}>
          <Scale size={18} className={
            conclusao.severidade === 'favoravel' ? 'text-emerald-600' :
            conclusao.severidade === 'atencao' ? 'text-amber-600' :
            'text-slate-500'
          } />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-semibold text-slate-800">{conclusao.titulo}</h4>
            <BadgeSeveridade tipo={conclusao.severidade} />
          </div>
          <p className="text-sm text-slate-500 mt-1 line-clamp-2">{conclusao.resumo}</p>
          
          <div className="flex items-center gap-4 mt-2">
            <div className="flex items-center gap-1.5">
              <Brain size={12} className="text-slate-400" />
              <span className="text-xs text-slate-400">Confiança: {conclusao.confianca}%</span>
              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className={`h-full rounded-full ${
                    conclusao.confianca >= 90 ? 'bg-emerald-500' :
                    conclusao.confianca >= 75 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${conclusao.confianca}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="text-slate-400 mt-1">
          {expandido ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {expandido && (
        <div className="px-5 pb-5 pt-2 border-t border-slate-100 bg-slate-50/30">
          <div className="space-y-3">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Análise Detalhada</p>
              <p className="text-sm text-slate-700 leading-relaxed">{conclusao.resumo}</p>
            </div>
            <div className="flex items-start gap-2 p-3 bg-slate-100 rounded-lg">
              <BookOpen size={14} className="text-slate-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-semibold text-slate-500">Fundamento Legal</p>
                <p className="text-sm text-slate-700">{conclusao.fundamento_legal}</p>
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
    critica: 'bg-red-50 text-red-700 border-red-200',
    alta: 'bg-amber-50 text-amber-700 border-amber-200',
    media: 'bg-blue-50 text-blue-700 border-blue-200',
    baixa: 'bg-slate-50 text-slate-600 border-slate-200',
  };

  const categoriaIcones = {
    cronologica: Calendar,
    processual: Gavel,
    tributaria: Scale,
  };

  const Icon = categoriaIcones[fato.categoria] || FileText;

  return (
    <div className="flex gap-4 p-4 bg-white rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
          <Icon size={18} className="text-slate-500" />
        </div>
        <div className="w-px flex-1 bg-slate-200" />
      </div>

      <div className="flex-1 min-w-0 pb-2">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-bold text-slate-800">{fato.data}</span>
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border uppercase ${relevanciaCores[fato.relevancia]}`}>
            {fato.relevancia}
          </span>
        </div>
        <p className="text-sm text-slate-700 leading-relaxed">{fato.descricao}</p>
        <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
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
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-700">
            {index + 1}
          </div>
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Silogismo Jurídico</span>
        </div>
        <button
          onClick={copiarTexto}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-indigo-600 transition-colors px-2 py-1 rounded-lg hover:bg-indigo-50"
        >
          {copiado ? <Check size={13} /> : <Copy size={13} />}
          {copiado ? 'Copiado' : 'Copiar'}
        </button>
      </div>

      <div className="space-y-3">
        <div className="p-3 bg-slate-50 rounded-lg border-l-3 border-l-slate-300">
          <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">Premissa (Major)</p>
          <p className="text-sm text-slate-700 leading-relaxed">{raciocinio.premissa}</p>
        </div>

        <div className="p-3 bg-indigo-50/50 rounded-lg border-l-3 border-l-indigo-300">
          <p className="text-[10px] font-bold text-indigo-400 uppercase mb-1">Aplicação ao Caso Concreto (Minor)</p>
          <p className="text-sm text-slate-700 leading-relaxed">{raciocinio.aplicacao}</p>
        </div>

        <div className="p-3 bg-emerald-50/50 rounded-lg border-l-3 border-l-emerald-400">
          <p className="text-[10px] font-bold text-emerald-600 uppercase mb-1">Conclusão Lógica</p>
          <p className="text-sm text-slate-800 font-medium leading-relaxed">{raciocinio.conclusao_logica}</p>
        </div>

        <div className="flex items-start gap-2 pt-2 border-t border-slate-100">
          <Gavel size={14} className="text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-500 italic">{raciocinio.referencia}</p>
        </div>
      </div>
    </div>
  );
};

// ============================================
// COMPONENTE PRINCIPAL: RESULTADO DA ANÁLISE
// ============================================
const ResultadoAnalise = ({ analise, onVoltar, onNovaAnalise }) => {
  const [abaAtiva, setAbaAtiva] = useState('conclusoes');
  const [conclusaoExpandida, setConclusaoExpandida] = useState(1);
  const [baixando, setBaixando] = useState(false);

  // USA O RESULTADO REAL DA IA SE HOUVER, CASO CONTRÁRIO USA O MOCK
  const resultado = analise ? {
    ...RESULTADO_MOCK,
    ...analise
  } : RESULTADO_MOCK;

  const handleDownloadParecer = async () => {
    setBaixando(true);

    await new Promise((resolve) => setTimeout(resolve, 2500));

    const conteudoParecer = gerarConteudoParecer(resultado);

    const blob = new Blob([conteudoParecer], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Parecer_Tributario_${resultado.metadata.id_analise}.txt`;
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
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={onVoltar}
                className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-all"
              >
                <ArrowLeft size={20} />
              </button>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold text-slate-800">Resultado da Análise</h1>
                  <span className="text-xs font-mono text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
                    {resultado.metadata.id_analise}
                  </span>
                </div>
                <p className="text-sm text-slate-500">
                  Processo {resultado.metadata.processo} • {resultado.metadata.data_analise}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => window.print()}
                className="hidden sm:flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all"
              >
                <Printer size={16} />
                Imprimir
              </button>
              <button
                onClick={handleDownloadParecer}
                disabled={baixando}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-lg shadow-emerald-600/20 transition-all disabled:opacity-60"
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

      <div className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Parte Autora</p>
              <p className="text-sm font-medium text-slate-700 truncate">{resultado.metadata.parte_autora}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Parte Ré</p>
              <p className="text-sm font-medium text-slate-700 truncate">{resultado.metadata.parte_reu}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Valor da Causa</p>
              <p className="text-sm font-medium text-emerald-700">{resultado.metadata.valor_causa}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Advogado</p>
              <p className="text-sm font-medium text-slate-700">{resultado.metadata.advogado}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">OAB</p>
              <p className="text-sm font-medium text-slate-700">{resultado.metadata.oab}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Modelo IA</p>
              <p className="text-sm font-medium text-slate-700">{resultado.metadata.modelo_ia}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white border-b border-slate-200 sticky top-[73px] z-30">
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
                      ? 'border-emerald-500 text-emerald-700 bg-emerald-50/50'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }
                  `}
                >
                  <Icon size={16} />
                  {aba.label}
                  <span className={`
                    text-xs px-1.5 py-0.5 rounded-full
                    ${ativa ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}
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
              <h2 className="text-lg font-bold text-slate-800">Conclusões da IA</h2>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <CheckCircle2 size={16} className="text-emerald-500" />
                <span>{resultado.conclusoes?.filter(c => c.severidade === 'favoravel').length || 0} favoráveis</span>
                <span className="text-slate-300">•</span>
                <AlertTriangle size={16} className="text-amber-500" />
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
              <h2 className="text-lg font-bold text-slate-800">Fatos Importantes Extraídos</h2>
              <span className="text-sm text-slate-500">Timeline cronológica</span>
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
              <h2 className="text-lg font-bold text-slate-800">Raciocínio Lógico da IA</h2>
              <span className="text-sm text-slate-500">Silogismos jurídicos aplicados</span>
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
              <h2 className="text-lg font-bold text-slate-800">Recomendações Estratégicas</h2>
              <span className="text-sm text-slate-500">Ações sugeridas pela IA</span>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-6">
              <div className="space-y-4">
                {resultado.recomendacoes?.map((rec, i) => (
                  <div key={i} className="flex items-start gap-4">
                    <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-emerald-700">{i + 1}</span>
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="text-sm text-slate-700 leading-relaxed">{rec}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <div className="max-w-6xl mx-auto px-6 pb-12">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-8 text-center text-white shadow-xl">
          <h3 className="text-xl font-bold mb-2">Precisa de uma nova análise?</h3>
          <p className="text-emerald-100 mb-6">Processe novos documentos e obtenha insights tributários em segundos.</p>
          <button
            onClick={onNovaAnalise}
            className="px-6 py-3 bg-white text-emerald-700 font-semibold rounded-xl hover:bg-emerald-50 transition-all shadow-lg"
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
Data/Hora:            ${metadata.data_analise} às ${metadata.hora_analise}
Modelo IA:            ${metadata.modelo_ia}
Advogado Responsável: ${metadata.advogado} — OAB ${metadata.oab}
Escritório:           ${metadata.escritorio}

IDENTIFICAÇÃO DO PROCESSO
────────────────────────────────────────────────────────────────────────────────
Número:               ${metadata.processo}
Parte Autora:         ${metadata.parte_autora}
Parte Ré:             ${metadata.parte_reu}
Valor da Causa:       ${metadata.valor_causa}

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